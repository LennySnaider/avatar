/**
 * Motor de oferta (spec A4): decide si un borrador recién generado debe
 * llevar adjunto contenido de pago, y cuál. NO envía nada: sólo escribe la
 * oferta en `agent_messages.media`. Quien envía es `sendAgentMessage`, que
 * tras entregar el texto entrega la media pagada con `source: 'agent'` —
 * la única forma de producir una venta `sold_by = ai` (20%).
 *
 * Gates, en orden y todos fallando cerrado:
 *   1. el chat es de Telegram y `ai_offers_enabled` está encendido;
 *   2. hay catálogo habilitado, filtrado por `maxOfferStars` y sin lo que
 *      este fan ya compró;
 *   3. no estamos en enfriamiento (`offerCooldownHours`, default 6);
 *   4. el modelo dice que sí, con un índice válido.
 * Si cualquier cosa falla (JSON roto, índice fuera de rango, error de red)
 * no se ofrece y se loguea: una oferta mal puesta es dinero mal cobrado.
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
import { filterOfferCandidates, findPaidMediaOffer, isOfferOnCooldown, type PaidMediaOffer } from './offerGate'

const DEFAULT_COOLDOWN_HOURS = 6

/** Cuántos mensajes de salida se miran hacia atrás buscando la última oferta. */
const COOLDOWN_LOOKBACK = 20

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
        const { data: draft } = await supabase
            .from('agent_messages')
            .select('id, organization_id, chat_id, text, media')
            .eq('id', draftMessageId)
            .maybeSingle()
        if (!draft || findPaidMediaOffer(draft.media)) return 'skipped'

        const { data: chat } = await supabase
            .from('agent_chats')
            .select('id, organization_id, avatar_id, platform, external_chat_id')
            .eq('organization_id', draft.organization_id)
            .eq('id', draft.chat_id)
            .maybeSingle()
        if (!chat || !chat.platform.startsWith('telegram')) return 'skipped'

        // Gate 1: el interruptor de ofertas del canal.
        const settings = await loadTelegramSettings(chat.avatar_id)
        if (!settings?.aiOffersEnabled) return 'skipped'

        const { data: personaRow } = await supabase
            .from('avatar_personas')
            .select('*')
            .eq('organization_id', chat.organization_id)
            .eq('avatar_id', chat.avatar_id)
            .maybeSingle()
        if (!personaRow) return 'skipped'
        // Mismo camino fila→DTO que `draftPipeline.ts`: el DTO da
        // provider/model y la fila cruda sigue siendo la única que tiene la
        // `api_key` (toPersonaDTO la omite a propósito).
        const persona = toPersonaDTO(personaRow as AvatarPersonaRow)
        const cfg = parseAutopilot(personaRow as AvatarPersonaRow)

        // Gate 3: enfriamiento. Última oferta a ESTE chat. Se mira sólo hacia
        // atrás en los mensajes de salida; el borrador de ahora no cuenta
        // porque arriba ya se comprobó que no lleva oferta.
        const { data: recentOut } = await supabase
            .from('agent_messages')
            .select('media, created_at')
            .eq('organization_id', chat.organization_id)
            .eq('chat_id', chat.id)
            .eq('direction', 'out')
            .order('created_at', { ascending: false })
            .limit(COOLDOWN_LOOKBACK)
        const lastOffer = (recentOut ?? []).find((m) => findPaidMediaOffer(m.media))
        const cooldownHours = cfg.offerCooldownHours ?? DEFAULT_COOLDOWN_HOURS
        if (isOfferOnCooldown(lastOffer?.created_at ?? null, Date.now(), cooldownHours)) {
            return 'skipped'
        }

        // Gate 2: catálogo habilitado menos lo que este fan ya compró.
        const { data: items } = await supabase
            .from('telegram_paid_media_items')
            .select('id, title, star_price')
            .eq('organization_id', chat.organization_id)
            .eq('avatar_id', chat.avatar_id)
            .eq('enabled', true)
            .order('sort_order', { ascending: true })
            .limit(50)
        const { data: bought } = await supabase
            .from('telegram_stars_sales')
            .select('item_id')
            .eq('organization_id', chat.organization_id)
            .eq('chat_id', chat.id)
            .eq('status', 'purchased')
        const candidates = filterOfferCandidates(
            (items ?? []).map((i) => ({ id: i.id, title: i.title, stars: i.star_price })),
            {
                maxOfferStars: cfg.maxOfferStars,
                purchasedItemIds: (bought ?? []).map((b) => b.item_id).filter((x): x is string => Boolean(x)),
            },
        )
        if (candidates.length === 0) return 'skipped'

        // Gate 4: el modelo juzga el momento. El historial se acota a lo que
        // de verdad ocurrió (`received`/`sent`, igual que `draftPipeline`), de
        // modo que el borrador de ahora no salga dos veces en el prompt.
        const { data: recent } = await supabase
            .from('agent_messages')
            .select('direction, text')
            .eq('organization_id', chat.organization_id)
            .eq('chat_id', chat.id)
            .in('status', ['received', 'sent'])
            .not('text', 'is', null)
            .order('created_at', { ascending: false })
            .limit(8)
        const transcript = (recent ?? [])
            .slice()
            .reverse()
            .map((m) => `${m.direction === 'in' ? 'FAN' : 'ME'}: ${m.text}`)
            .join('\n')
        const catalog = candidates.map((c, i) => `${i}. ${c.title} — ${c.stars} Stars`).join('\n')

        const prompt = `You decide whether NOW is a good moment to offer paid content in a private Telegram chat between a creator and a fan.

CONVERSATION (oldest first):
${transcript}

MY DRAFT REPLY (about to be sent):
${draft.text ?? ''}

CATALOG (index. title — price):
${catalog}

Rules: offer only if the fan shows interest, warmth or asks for more; never on a first hello, a complaint or a sensitive topic. Pick the ONE item that best fits the conversation. The caption is one short teasing sentence in the fan's language, no price (the price is shown by Telegram).

Answer with JSON only: {"shouldOffer": boolean, "index": number, "caption": string}`

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
            shouldOffer?: boolean
            index?: number
            caption?: string
        }
        if (!parsed.shouldOffer) return 'skipped'
        const idx = Number(parsed.index)
        if (!Number.isInteger(idx) || idx < 0 || idx >= candidates.length) {
            console.error('[telegram offer] índice fuera de rango', { idx, candidatos: candidates.length })
            return 'skipped'
        }
        const pick = candidates[idx]

        const offer: PaidMediaOffer = {
            type: 'paid_media_offer',
            itemId: pick.id,
            stars: pick.stars,
            caption: (parsed.caption ?? '').trim().slice(0, CAPTION_MAX),
        }
        const existing = Array.isArray(draft.media) ? draft.media : []
        // `.eq('status', 'draft')` es la guarda de carrera: si el humano
        // aprobó o envió el borrador mientras el modelo pensaba, la oferta NO
        // se cuela en un mensaje que ya salió.
        await supabase
            .from('agent_messages')
            .update({ media: [...existing, offer] as never, updated_at: new Date().toISOString() })
            .eq('organization_id', draft.organization_id)
            .eq('id', draft.id)
            .eq('status', 'draft')
        return 'attached'
    } catch (e) {
        console.error('[telegram offer] maybeAttachPaidMediaOffer', e)
        return 'skipped'
    }
}
