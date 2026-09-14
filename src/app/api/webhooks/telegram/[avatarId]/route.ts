/**
 * POST /api/webhooks/telegram/[avatarId]
 *
 * Updates de la Bot API para el bot de ESTE avatar (uno por avatar — ver
 * `avatar_telegram_settings`, migración de la Tarea 1). Suscrito sólo a
 * `['message', 'purchased_paid_media']` (`setWebhook` en `client.ts`).
 *
 * El middleware ya exime `/api/webhooks/` de la sesión de NextAuth — este
 * endpoint no tiene ni puede tener cookie: quien golpea aquí es el servidor
 * de Telegram.
 *
 * ORDEN OBLIGATORIO (cada paso decide su propio código de respuesta y NUNCA
 * se salta al siguiente si el actual ya respondió):
 *
 *   1. Cargar ajustes por `avatarId`. Si la carga en sí revienta (fallo de
 *      base) → 200, registrado. Si no revienta, su resultado TODAVÍA no
 *      decide nada — eso es el paso 3, no éste. Decidir aquí (como hacía una
 *      versión anterior de este fichero) es justo el bug que describe el
 *      paso 2.
 *   2. Comparar `x-telegram-bot-api-secret-token` contra el secreto guardado,
 *      en tiempo constante (`crypto.timingSafeEqual`), SIEMPRE — exista o no
 *      la fila, esté o no habilitada. Si no hay fila (y por tanto no hay
 *      secreto real que leer) se compara contra uno FICTICIO generado al
 *      vuelo, sólo para que la comparación ocurra igual: nunca va a coincidir
 *      con ninguna cabecera, así que el resultado es el mismo 401 que con un
 *      secreto real equivocado. Si no coincide → 401 Y PARA AHÍ: nada de logs
 *      ni de más trabajo. Es la ÚNICA respuesta distinta de 200 que existe en
 *      este fichero — a propósito, es la única vez que de verdad hace falta
 *      que el cliente SEPA que algo está mal (todo lo demás es "no hay nada
 *      que hacer" o "ya hubo un error de nuestro lado", y ninguno de los dos
 *      es asunto de quien llama).
 *      Quien tenga este secreto puede fabricar un `purchased_paid_media` e
 *      inventarse una comisión real contra el monedero de la organización —
 *      por eso se compara ANTES de mirar si hay fila o si está habilitada.
 *      Una versión anterior de este fichero miraba primero: sin fila o con
 *      `enabled = false` respondía 200 SIN comparar el secreto, así que un
 *      401 sólo era posible cuando el avatar ya tenía el canal activo — el
 *      CÓDIGO DE RESPUESTA delataba ese booleano a quien ya conociera el
 *      `avatarId`, aunque ni el cuerpo ni ningún log lo dijeran. Comparando
 *      siempre primero, un secreto incorrecto se rechaza igual exista o no la
 *      fila, esté o no habilitada, y ni la respuesta ni ningún log de este
 *      bloque delatan ya nada de los ajustes.
 *      Invertir el orden no reabre la tormenta de reintentos que motivó el
 *      orden original (ver `disconnectTelegramBot` en
 *      `AgentTelegramService.ts`): desconectar NUNCA borra `webhook_secret`,
 *      así que un reintento real de Telegram contra un bot ya desconectado
 *      sigue trayendo el secreto correcto, pasa este paso, y cae en el 200
 *      silencioso del paso 3 — no en este 401.
 *   3. Sin fila o `enabled = false` → 200 EN SILENCIO. Nunca 404: un 404 hace
 *      que Telegram acumule reintentos indefinidamente sobre una URL que para
 *      nosotros es, simplemente, "no hay nada que hacer aquí".
 *   4. JSON mal formado (incluido un cuerpo vacío) → 200. Ya pasamos el
 *      secreto: esto es un bug propio o un capricho de Telegram, no un
 *      ataque, así que sí es aceptable registrar el motivo.
 *   5. Idempotencia: `telegram_webhook_events` tiene PK `(avatar_id,
 *      update_id)`. Un choque de esa clave es Telegram reintentando un update
 *      que YA vimos → 200 inmediato, sin reprocesar.
 *   6. Procesar, con un `try/catch` GLOBAL que registra y responde 200. Un
 *      500 aquí dispararía una tormenta de reintentos sobre un evento que ya
 *      falló una vez — no lo arregla, sólo lo repite.
 *
 * `message`: sólo chats privados y sólo si el emisor no es un bot. Registra
 * la conversación (`upsertChat` + `ingestMessage`) y, si `shouldDraftTelegramReply`
 * (gate del canal, `aiGate.ts`) lo autoriza, genera el borrador DESPUÉS de
 * responder a Telegram (`after()`, ver `handleMessage`); si `ai_offers_enabled`
 * está encendido, el motor de oferta (`offerEngine.ts`) decide si ese borrador
 * lleva contenido de pago adjunto; y por último lo programa con autopilot si el
 * chat quedó en modo `auto`. Ese orden importa: autopilot lee la media que el
 * motor acaba de escribir para decidir si el borrador puede salir solo.
 *
 * `purchased_paid_media`: la venta se busca por `paid_media_payload` con una
 * transición ATÓMICA condicionada a su estado anterior (`offered` →
 * `purchased` en una sola sentencia). Cero filas afectadas significa una de
 * dos cosas — un reintento de una compra que ya procesamos, o un payload que
 * no reconocemos — y NINGUNA de las dos merece llamar a `recordStarsSale`.
 * Esta transición es la ÚNICA barrera contra comisionar dos veces la misma
 * compra, junto con la clave de idempotencia del propio ledger
 * (`stars_sale:<saleId>` en `settleStarsCommission`).
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import crypto from 'node:crypto'
import { orgSupabase } from '@/lib/org/orgTable'
import { loadTelegramSettings, loadTelegramWebhookSecret, type TelegramSettings } from '@/lib/telegram/settings'
import type { PaidMediaPurchased, TelegramUpdate, TgMessage } from '@/lib/telegram/client'
import { ingestMessage, resolveAvatarTargetById, touchFanMemory, upsertChat } from '@/lib/agent/inboxSync'
import { recordStarsSale, type StarsSaleEvent } from '@/lib/telegram/sales'
import { after } from 'next/server'
import { generateDraftReply } from '@/lib/agent/draftPipeline'
import { maybeAutopilotSend } from '@/lib/agent/autopilot'
import { shouldDraftTelegramReply } from '@/lib/telegram/aiGate'
import { maybeAttachPaidMediaOffer } from '@/lib/telegram/offerEngine'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const OK = () => NextResponse.json({ ok: true })

/**
 * Comparación en tiempo constante. Longitudes distintas se descartan ANTES
 * de `timingSafeEqual` (que exige buffers del mismo tamaño byte a byte, o
 * lanza) — mismo patrón que `verifySignature` en el webhook de Fanvue.
 */
function secretMatches(header: string | null, secret: string | null): boolean {
    if (!header || !secret) return false
    const a = Buffer.from(header)
    const b = Buffer.from(secret)
    return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/**
 * `true` sólo si la clave primaria `(avatar_id, update_id)` YA EXISTÍA —
 * Telegram reintentando un update que ya vimos. Cualquier OTRO fallo del
 * insert NO se trata como duplicado: `ingestMessage` dedupea además por su
 * propio id externo y la compra por su propia transición atómica, así que
 * ambos caminos son idempotentes por su cuenta. Ante la duda se procesa —
 * saltarse un update aquí sería definitivo, porque de todos modos se
 * responde 200 y Telegram no volvería a intentarlo.
 */
async function isDuplicateUpdate(avatarId: string, updateId: number): Promise<boolean> {
    const { error } = await orgSupabase()
        .from('telegram_webhook_events')
        .insert({ avatar_id: avatarId, update_id: updateId })
    if (!error) return false
    if (error.code === '23505') return true
    console.error('[telegram webhook] idempotencia', error.message)
    return false
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ avatarId: string }> }) {
    const { avatarId } = await params

    // 1. Ajustes del avatar. Se cargan siempre, pero SU RESULTADO no decide
    //    nada todavía — eso es el paso 3, después del secreto. Ver cabecera.
    let settings: TelegramSettings | null
    try {
        settings = await loadTelegramSettings(avatarId)
    } catch (e) {
        console.error('[telegram webhook] loadTelegramSettings', e)
        return OK()
    }

    // 2. Secreto. SIEMPRE se compara — exista o no la fila, esté habilitada o
    //    no — ver cabecera del fichero sobre por qué el orden importa. Sin
    //    fila (o si por lo que sea no hay secreto que leer) se compara contra
    //    uno FICTICIO generado al vuelo, sólo para que la comparación en
    //    tiempo constante ocurra igual: nunca coincide con ninguna cabecera,
    //    así que el resultado es el mismo 401 que con un secreto real
    //    equivocado.
    const header = req.headers.get('x-telegram-bot-api-secret-token')
    let secret: string | null = null
    try {
        secret = settings ? await loadTelegramWebhookSecret(avatarId) : null
    } catch (e) {
        console.error('[telegram webhook] loadTelegramWebhookSecret', e)
        return OK()
    }
    if (!secretMatches(header, secret ?? crypto.randomBytes(32).toString('hex'))) {
        return new NextResponse(null, { status: 401 })
    }

    // 3. Sin fila o `enabled = false` → 200 EN SILENCIO. Nunca 404 (ver cabecera).
    if (!settings || !settings.enabled) {
        return OK()
    }

    // 4. JSON mal formado (cuerpo vacío incluido).
    const rawBody = await req.text()
    let update: TelegramUpdate
    try {
        update = JSON.parse(rawBody) as TelegramUpdate
    } catch {
        console.warn('[telegram webhook] cuerpo no-JSON')
        return OK()
    }
    if (typeof update?.update_id !== 'number') {
        return OK()
    }

    // 5. Idempotencia.
    if (await isDuplicateUpdate(avatarId, update.update_id)) {
        return OK()
    }

    // 6. Procesar.
    try {
        if (update.message) {
            await handleMessage(settings, update.message)
        } else if (update.purchased_paid_media) {
            await handlePurchasedPaidMedia(settings, update.purchased_paid_media)
        }
    } catch (e) {
        console.error('[telegram webhook] handler error', e)
    }

    return OK()
}

/** Sólo chats privados, y nunca si el emisor es un bot (evita eco/spam). */
async function handleMessage(settings: TelegramSettings, message: TgMessage): Promise<void> {
    if (message.chat.type !== 'private') return
    if (message.from?.is_bot) return

    const target = await resolveAvatarTargetById(settings.avatarId)
    if (!target) return

    const fanUuid = String(message.chat.id)
    const fanDisplayName =
        [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' ') || null
    const fanHandle = message.from?.username ?? null
    const sentAt = new Date(message.date * 1000).toISOString()
    const text = message.text ?? message.caption ?? null

    const chat = await upsertChat({
        target,
        platform: 'telegram',
        fanUuid,
        fanDisplayName,
        fanHandle,
        lastMessageAt: sentAt,
        lastFanMessageAt: sentAt,
        // Spec A3-bis: los chats nuevos de Telegram nacen en el modo que el
        // creador eligió para el canal. Los existentes conservan el suyo.
        defaultMode: settings.aiDefaultChatMode,
    })
    const { inserted } = await ingestMessage({
        organizationId: target.organizationId,
        chatId: chat.id,
        direction: 'in',
        externalMessageId: String(message.message_id),
        text,
        externalCreatedAt: sentAt,
    })
    await touchFanMemory(target, fanUuid, fanDisplayName, 'telegram')

    // Gate del CANAL (aiGate.ts, spec A3-bis): independiente de
    // avatar_personas.enabled, que es el interruptor de Fanvue.
    const wantsDraft = shouldDraftTelegramReply({
        aiRepliesEnabled: settings.aiRepliesEnabled,
        chatMode: chat.mode,
        isCreator: chat.is_creator,
        text,
        inserted,
    })
    if (!wantsDraft) return

    // El LLM tarda 10-20 s y Telegram reintenta si no ve el 200 a tiempo:
    // el borrador se genera DESPUÉS de responder. `after()` mantiene viva la
    // función en Vercel hasta que esto termine (Next 15.5, estable).
    after(async () => {
        try {
            const draft = await generateDraftReply(chat.id)
            if (!draft) return
            // Spec A4: el motor de oferta decide si este borrador sale con
            // contenido de pago adjunto. Va ANTES de autopilot a propósito —
            // autopilot mira la media ya escrita para decidir si el borrador
            // puede salir solo o escala a humano.
            if (settings.aiOffersEnabled) {
                await maybeAttachPaidMediaOffer(draft.messageId)
            }
            if (chat.mode === 'auto') {
                await maybeAutopilotSend(chat.id, draft.messageId)
            }
        } catch (e) {
            console.error('[telegram webhook] borrador/autopilot', e)
        }
    })
}

/**
 * Transición atómica `offered → purchased` condicionada al estado anterior,
 * en UNA sola sentencia (ver cabecera del fichero). `payload` es único en
 * toda la tabla (columna `unique`), así que el filtro por avatar/organización
 * de abajo es defensa en profundidad, no lo que garantiza como mucho una
 * fila — eso ya lo garantiza la unicidad de `payload`.
 */
async function handlePurchasedPaidMedia(
    settings: TelegramSettings,
    purchase: PaidMediaPurchased,
): Promise<void> {
    const now = new Date().toISOString()
    const { data: sale, error } = await orgSupabase()
        .from('telegram_stars_sales')
        .update({
            status: 'purchased',
            purchased_at: now,
            telegram_user_id: purchase.from.id,
            updated_at: now,
        })
        .eq('organization_id', settings.organizationId)
        .eq('avatar_id', settings.avatarId)
        .eq('payload', purchase.paid_media_payload)
        .eq('status', 'offered')
        .select('*')
        .maybeSingle()

    if (error) {
        console.error('[telegram webhook] transición de venta', error.message)
        return
    }
    if (!sale) {
        // Cero filas: reintento de una compra ya procesada, o un payload que
        // no reconocemos. Ninguno de los dos llama a recordStarsSale — ver
        // cabecera del fichero.
        return
    }

    const event: StarsSaleEvent = {
        saleId: sale.id,
        organizationId: sale.organization_id,
        avatarId: sale.avatar_id,
        chatId: sale.chat_id,
        itemId: sale.item_id,
        stars: sale.stars,
        // `sold_by`/`source` son CHECK constraints en la base, no enums de
        // Postgres, así que el tipo generado los ve como `string`.
        soldBy: sale.sold_by as StarsSaleEvent['soldBy'],
        source: sale.source as StarsSaleEvent['source'],
        telegramUserId: purchase.from.id,
        purchasedAt: sale.purchased_at ?? now,
    }
    await recordStarsSale(event)
}
