/**
 * Motor de oferta (spec A4 + fotos-gratis Tarea 4): decide si un borrador
 * recién generado debe llevar adjunto contenido — un teaser GRATIS o
 * contenido DE PAGO — y cuál. NO envía nada: sólo escribe la oferta en
 * `agent_messages.media`. Quien envía es `sendAgentMessage`, que tras entregar
 * el texto entrega el adjunto: `deliverFreeMedia` (sin cobro) o
 * `deliverPaidMedia` con `source: 'agent'` — la única forma de producir una
 * venta `sold_by = ai` (20%).
 *
 * El nombre exportado sigue siendo `maybeAttachPaidMediaOffer` para no tocar a
 * sus llamadores (webhook + inbox), pero desde la Tarea 4 decide entre TRES
 * salidas: nada, gratis o de pago. Un borrador lleva como mucho UNA.
 *
 * Gates, en orden y todos fallando cerrado:
 *   1. el borrador no lleva ya una oferta de ningún tipo (`isOfferMedia`), el
 *      chat es de Telegram y `ai_offers_enabled` está encendido;
 *   2. queda algo que ofrecer: catálogo de pago habilitado, filtrado por
 *      `maxOfferStars` y sin lo que este fan ya compró (ese tope tiene TRES
 *      lecturas, no dos: ausente = sin tope, `0` = no ofrecer nada, `> 0` =
 *      tope inclusivo, ver `filterOfferCandidates`), y/o catálogo gratis sin
 *      lo que a este fan ya se le mandó u ofreció (UNA VEZ por fan);
 *   3. no estamos en enfriamiento. La ventana es COMÚN a gratis y de pago
 *      (global-constraints.md): cualquier oferta reciente, de cualquier tipo,
 *      enfría a las dos. `offerCooldownHours` ausente = 6 h; un `0` explícito
 *      es SIN enfriamiento, y por eso se resuelve con `??` y no con `||`, que
 *      trataría ese cero como "no puesto";
 *   4. el modelo dice cuál de las dos listas y qué índice, y `resolveOfferAction`
 *      lo valida contra las listas REALES (ver esa función: un `free` con la
 *      lista gratis vacía mandaría de balde algo de pago).
 * Si cualquier cosa falla (JSON roto, índice fuera de rango, error de red)
 * no se ofrece y se loguea: una oferta mal puesta es dinero mal cobrado, y un
 * teaser mal puesto es contenido de pago regalado.
 * Esta función NUNCA lanza — el webhook la llama dentro de un `after()` cuya
 * caída se llevaría por delante el autopilot que viene detrás.
 *
 * F4.2 Tarea 4 — EXENTO de `orgTable`: lo llama el webhook, sin sesión. Todo
 * cuelga de `chat.organization_id` de la fila resuelta.
 *
 * POR QUÉ `orgSupabase()` Y NO `agentSupabase()`: este motor cruza el catálogo
 * con las VENTAS del fan, y `telegram_stars_sales` no está declarada en el
 * schema extendido de `@/lib/agent/db` (sólo lo está `telegram_paid_media_items`,
 * que añadió la Tarea 4 para `draftPipeline`). Medido: con `agentSupabase()`
 * esa consulta no compila (TS2769). Declarar allí una segunda vista mínima de
 * una tabla que `database.generated` ya tipa entera sería duplicar el tipo —
 * justo lo que la cabecera de esa vista pide evitar. `orgSupabase()` las tipa
 * las cinco de una vez y es además lo que usan los cuatro ficheros hermanos de
 * esta carpeta con el mismo perfil sin sesión (`settings.ts`, `sales.ts`,
 * `paidMedia.ts`, `bots.ts`). Exención escrita en `scripts/check-tenant-access.mjs`
 * y en el bloque `no-restricted-syntax` de `eslint.config.mjs`.
 */
import { generateText } from 'ai'
import { orgSupabase } from '@/lib/org/orgTable'
import { getChatModel } from '@/lib/agent/chatProvider'
import { toPersonaDTO } from '@/lib/agent/personaMapper'
import { parseAutopilot } from '@/lib/agent/autopilot'
import type { AvatarPersonaRow } from '@/lib/agent/db'
import { loadTelegramSettings } from '@/lib/telegram/settings'
import {
    collectFreeMediaItemIds,
    filterFreeCandidates,
    filterOfferCandidates,
    isOfferMedia,
    isOfferOnCooldown,
    resolveOfferAction,
    type FreeMediaOffer,
    type PaidMediaOffer,
} from './offerGate'

const DEFAULT_COOLDOWN_HOURS = 6

/** Cuántos mensajes de salida se miran hacia atrás buscando la última oferta. */
const COOLDOWN_LOOKBACK = 20

/**
 * Cuántos mensajes de salida se leen para reconstruir qué teasers gratis ya
 * viajaron a este chat. Mucho más hondo que el enfriamiento y a propósito: un
 * teaser se manda UNA VEZ POR FAN para siempre, así que la ventana tiene que
 * cubrir la conversación entera, no las últimas horas. 200 cubre de sobra un
 * chat normal; si un chat fuera más largo que eso, lo peor que pasa es que un
 * teaser muy antiguo pudiera repetirse — preferible a leer el historial
 * completo en cada borrador.
 */
const FREE_HISTORY_LOOKBACK = 200

/** Tope de la Bot API para el caption de una media. */
const CAPTION_MAX = 1024

/** Quita el cercado markdown (```json … ```) con que algunos modelos envuelven
 *  la respuesta aunque se les pida JSON pelado. */
function stripFence(raw: string): string {
    return raw
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim()
}

export async function maybeAttachPaidMediaOffer(draftMessageId: string): Promise<'attached' | 'skipped'> {
    const supabase = orgSupabase()
    try {
        // El borrador se busca por id sin filtro de org porque ESTE id lo acaba
        // de producir nuestro propio pipeline; es la fila que RESUELVE la org.
        // De aquí en adelante todo cuelga de `draft.organization_id`.
        const { data: draft, error: draftError } = await supabase
            .from('agent_messages')
            .select('id, organization_id, chat_id, text, media')
            .eq('id', draftMessageId)
            .maybeSingle()
        if (draftError) {
            console.error('[telegram offer] no se pudo leer el borrador', { draftMessageId }, draftError)
            return 'skipped'
        }
        // `isOfferMedia` y no `findPaidMediaOffer`: un borrador que ya lleva un
        // teaser gratis tampoco admite una segunda oferta encima.
        if (!draft || isOfferMedia(draft.media)) return 'skipped'

        const { data: chat, error: chatError } = await supabase
            .from('agent_chats')
            .select('id, organization_id, avatar_id, platform, external_chat_id')
            .eq('organization_id', draft.organization_id)
            .eq('id', draft.chat_id)
            .maybeSingle()
        if (chatError) {
            console.error(
                '[telegram offer] no se pudo leer el chat',
                { draftMessageId, chatId: draft.chat_id },
                chatError,
            )
            return 'skipped'
        }
        if (!chat || !chat.platform.startsWith('telegram')) return 'skipped'

        // Gate 1: el interruptor de ofertas del canal.
        const settings = await loadTelegramSettings(chat.avatar_id)
        if (!settings?.aiOffersEnabled) return 'skipped'

        const { data: personaRow, error: personaError } = await supabase
            .from('avatar_personas')
            .select('*')
            .eq('organization_id', chat.organization_id)
            .eq('avatar_id', chat.avatar_id)
            .maybeSingle()
        if (personaError) {
            console.error(
                '[telegram offer] no se pudo leer la persona del avatar',
                { draftMessageId, chatId: chat.id },
                personaError,
            )
            return 'skipped'
        }
        if (!personaRow) return 'skipped'
        // Mismo camino fila→DTO que `draftPipeline.ts`: el DTO da
        // provider/model y la fila cruda sigue siendo la única que tiene la
        // `api_key` (toPersonaDTO la omite a propósito).
        const persona = toPersonaDTO(personaRow as AvatarPersonaRow)
        const cfg = parseAutopilot(personaRow as AvatarPersonaRow)

        // Historial de salida de ESTE chat, leído UNA VEZ y usado para dos
        // cosas distintas (dos consultas al mismo filtro serían dos viajes
        // para el mismo dato):
        //   - enfriamiento: sólo los `COOLDOWN_LOOKBACK` más recientes;
        //   - teasers gratis ya vistos: los `FREE_HISTORY_LOOKBACK` enteros.
        // El borrador de ahora no cuenta: arriba ya se comprobó que va limpio.
        const { data: recentOut, error: recentOutError } = await supabase
            .from('agent_messages')
            .select('media, created_at')
            .eq('organization_id', chat.organization_id)
            .eq('chat_id', chat.id)
            .eq('direction', 'out')
            .order('created_at', { ascending: false })
            .limit(FREE_HISTORY_LOOKBACK)
        if (recentOutError) {
            console.error(
                '[telegram offer] no se pudo leer el historial de salida del chat',
                { draftMessageId, chatId: chat.id },
                recentOutError,
            )
            return 'skipped'
        }
        const outHistory = recentOut ?? []

        // Gate 3: enfriamiento COMÚN. Cualquier oferta reciente —gratis o de
        // pago, prometida o entregada— enfría a las dos listas.
        const lastOffer = outHistory.slice(0, COOLDOWN_LOOKBACK).find((m) => isOfferMedia(m.media))
        const cooldownHours = cfg.offerCooldownHours ?? DEFAULT_COOLDOWN_HOURS
        if (isOfferOnCooldown(lastOffer?.created_at ?? null, Date.now(), cooldownHours)) {
            return 'skipped'
        }

        // Gate 2: catálogo habilitado, de pago y gratis en una sola lectura
        // (`is_free` los separa aquí abajo).
        const { data: items, error: itemsError } = await supabase
            .from('telegram_paid_media_items')
            .select('id, title, star_price, is_free, enabled')
            .eq('organization_id', chat.organization_id)
            .eq('avatar_id', chat.avatar_id)
            .eq('enabled', true)
            // Los gratis PRIMERO, por el mismo motivo que en `draftPipeline`:
            // el `limit` es común a las dos listas y un catálogo de pago largo
            // dejaría al motor sin ningún candidato gratis que ofrecer.
            .order('is_free', { ascending: false })
            .order('sort_order', { ascending: true })
            .limit(50)
        if (itemsError) {
            console.error(
                '[telegram offer] no se pudo leer el catálogo de Telegram',
                { draftMessageId, chatId: chat.id },
                itemsError,
            )
            return 'skipped'
        }
        // Sin esta lista no se puede saber qué compró ya el fan, y ofrecerle
        // de nuevo algo que ya pagó es la peor forma de fallar: por eso un
        // error aquí corta, no se trata como "no ha comprado nada".
        const { data: bought, error: boughtError } = await supabase
            .from('telegram_stars_sales')
            .select('item_id')
            .eq('organization_id', chat.organization_id)
            .eq('chat_id', chat.id)
            .eq('status', 'purchased')
        if (boughtError) {
            console.error(
                '[telegram offer] no se pudieron leer las compras previas del fan',
                { draftMessageId, chatId: chat.id },
                boughtError,
            )
            return 'skipped'
        }

        const catalog = items ?? []
        const paidCandidates = filterOfferCandidates(
            catalog.filter((i) => !i.is_free).map((i) => ({ id: i.id, title: i.title, stars: i.star_price })),
            {
                maxOfferStars: cfg.maxOfferStars,
                purchasedItemIds: (bought ?? []).map((b) => b.item_id).filter((x): x is string => Boolean(x)),
            },
        )
        // Gratis: el catálogo gratis menos lo que este fan ya recibió o tiene
        // prometido en un borrador (ver `collectFreeMediaItemIds`).
        const freeCandidates = filterFreeCandidates(
            catalog.filter((i) => i.is_free).map((i) => ({ id: i.id, title: i.title })),
            collectFreeMediaItemIds(outHistory.map((m) => m.media)),
        )
        if (paidCandidates.length === 0 && freeCandidates.length === 0) return 'skipped'

        // Gate 4: el modelo juzga el momento. El historial se acota a lo que
        // de verdad ocurrió (`received`/`sent`, igual que `draftPipeline`), de
        // modo que el borrador de ahora no salga dos veces en el prompt.
        const { data: recent, error: recentError } = await supabase
            .from('agent_messages')
            .select('direction, text')
            .eq('organization_id', chat.organization_id)
            .eq('chat_id', chat.id)
            .in('status', ['received', 'sent'])
            .not('text', 'is', null)
            .order('created_at', { ascending: false })
            .limit(8)
        if (recentError) {
            console.error(
                '[telegram offer] no se pudo leer la conversación para juzgar el momento',
                { draftMessageId, chatId: chat.id },
                recentError,
            )
            return 'skipped'
        }
        const transcript = (recent ?? [])
            .slice()
            .reverse()
            .map((m) => `${m.direction === 'in' ? 'FAN' : 'ME'}: ${m.text}`)
            .join('\n')
        // Las dos listas se numeran POR SEPARADO desde 0: el índice sólo
        // significa algo junto a su `action`, y `resolveOfferAction` lo valida
        // contra la lista que toca.
        const freeList = freeCandidates.length
            ? freeCandidates.map((c, i) => `${i}. ${c.title}`).join('\n')
            : '(empty — "free" is NOT allowed)'
        const paidList = paidCandidates.length
            ? paidCandidates.map((c, i) => `${i}. ${c.title} — ${c.stars} Stars`).join('\n')
            : '(empty — "paid" is NOT allowed)'

        const prompt = `You decide whether NOW is a good moment to attach media to a reply in a private Telegram chat between a creator and a fan, and which kind.

CONVERSATION (oldest first):
${transcript}

MY DRAFT REPLY (about to be sent):
${draft.text ?? ''}

FREE TEASERS (index. title) — sent for free, one per fan, never repeated:
${freeList}

PAID CONTENT (index. title — price) — the fan pays with Telegram Stars:
${paidList}

Rules:
- "free": the fan asks for a photo/pic/selfie, or shows curiosity or warmth. Never on a bare "/start", a complaint or a sensitive topic. A free teaser is a hook to warm the chat up.
- "paid": only with clear intent to see more or to get something exclusive. Never on a first hello, a complaint or a sensitive topic.
- "none": anything else. When in doubt, "none".
- Never pick from a list marked empty.
- Pick the ONE item that best fits the conversation, by its index WITHIN its own list.
- The caption is one short teasing sentence in the fan's language, no price (Telegram shows the price).

Answer with JSON only: {"action": "none" | "free" | "paid", "index": number, "caption": string}`

        const { text } = await generateText({
            model: getChatModel({
                provider: persona.chatProvider,
                model: persona.chatModel,
                apiKey: personaRow.api_key,
            }),
            prompt,
            temperature: 0.2,
        })
        const parsed = JSON.parse(stripFence(text)) as {
            action?: unknown
            index?: unknown
            caption?: unknown
        }
        const decision = resolveOfferAction(parsed, freeCandidates.length, paidCandidates.length)
        if (!decision) {
            // Un `none` es la respuesta normal y no merece ruido; lo que sí lo
            // merece es que el modelo eligiera algo y la validación lo tirara:
            // ahí hubo un ítem que estuvo a punto de salir por la lista
            // equivocada (gratis lo de pago, o al revés).
            if (parsed.action === 'free' || parsed.action === 'paid') {
                console.warn('[telegram offer] decisión del modelo descartada por la validación', {
                    draftMessageId,
                    chatId: chat.id,
                    action: parsed.action,
                    index: parsed.index,
                    gratis: freeCandidates.length,
                    pago: paidCandidates.length,
                })
            }
            return 'skipped'
        }
        const caption = (typeof parsed.caption === 'string' ? parsed.caption : '').trim().slice(0, CAPTION_MAX)
        const offer: PaidMediaOffer | FreeMediaOffer =
            decision.kind === 'free'
                ? {
                      type: 'free_media_offer',
                      itemId: freeCandidates[decision.index].id,
                      caption,
                  }
                : {
                      type: 'paid_media_offer',
                      itemId: paidCandidates[decision.index].id,
                      stars: paidCandidates[decision.index].stars,
                      caption,
                  }
        const existing = Array.isArray(draft.media) ? draft.media : []
        // `.eq('status', 'draft')` es la guarda de carrera: si el humano
        // aprobó o envió el borrador mientras el modelo pensaba, la oferta NO
        // se cuela en un mensaje que ya salió.
        //
        // El `.select('id')` está para poder DISTINGUIR que la guarda saltó.
        // Sin él, un update que no tocó ninguna fila —porque el borrador ya
        // no era borrador— es indistinguible de uno que escribió, y la
        // función devolvía 'attached' habiendo adjuntado nada. Sólo se
        // devuelve 'attached' cuando la fila se escribió de verdad.
        const { data: updated, error: updateError } = await supabase
            .from('agent_messages')
            .update({ media: [...existing, offer] as never, updated_at: new Date().toISOString() })
            .eq('organization_id', draft.organization_id)
            .eq('id', draft.id)
            .eq('status', 'draft')
            .select('id')
        if (updateError) {
            console.error(
                '[telegram offer] no se pudo adjuntar la oferta',
                { draftMessageId, chatId: chat.id, kind: decision.kind, itemId: offer.itemId },
                updateError,
            )
            return 'skipped'
        }
        if (!updated || updated.length === 0) {
            console.error(
                '[telegram offer] la guarda status=draft disparó: el borrador ya no era borrador',
                { draftMessageId, chatId: chat.id, kind: decision.kind, itemId: offer.itemId },
            )
            return 'skipped'
        }
        return 'attached'
    } catch (e) {
        console.error('[telegram offer] maybeAttachPaidMediaOffer', e)
        return 'skipped'
    }
}
