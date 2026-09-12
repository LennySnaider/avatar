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
 *   1. Cargar ajustes por `avatarId`. Sin fila o `enabled = false` → 200 EN
 *      SILENCIO. Nunca 404: un 404 hace que Telegram acumule reintentos
 *      indefinidamente sobre una URL que para nosotros es, simplemente, "no
 *      hay nada que hacer aquí".
 *   2. Comparar `x-telegram-bot-api-secret-token` contra el secreto guardado,
 *      en tiempo constante (`crypto.timingSafeEqual`). Si no coincide → 401 Y
 *      PARA AHÍ: nada de logs ni de más trabajo. Es la ÚNICA respuesta
 *      distinta de 200 que existe en este fichero — a propósito, es la única
 *      vez que de verdad hace falta que el cliente SEPA que algo está mal
 *      (todo lo demás es "no hay nada que hacer" o "ya hubo un error de
 *      nuestro lado", y ninguno de los dos es asunto de quien llama).
 *      Quien tenga este secreto puede fabricar un `purchased_paid_media` e
 *      inventarse una comisión real contra el monedero de la organización —
 *      por eso se compara ANTES de cualquier otro efecto, y por eso ni la
 *      respuesta ni ningún log de este bloque mencionan si el avatar existe,
 *      si tiene bot, ni ningún dato de los ajustes ya cargados.
 *   3. JSON mal formado (incluido un cuerpo vacío) → 200. Ya pasamos el
 *      secreto: esto es un bug propio o un capricho de Telegram, no un
 *      ataque, así que sí es aceptable registrar el motivo.
 *   4. Idempotencia: `telegram_webhook_events` tiene PK `(avatar_id,
 *      update_id)`. Un choque de esa clave es Telegram reintentando un update
 *      que YA vimos → 200 inmediato, sin reprocesar.
 *   5. Procesar, con un `try/catch` GLOBAL que registra y responde 200. Un
 *      500 aquí dispararía una tormenta de reintentos sobre un evento que ya
 *      falló una vez — no lo arregla, sólo lo repite.
 *
 * `message`: sólo chats privados y sólo si el emisor no es un bot. Registra
 * la conversación (`upsertChat` + `ingestMessage`) para que exista un chat al
 * que ofrecer contenido — **no genera ningún borrador**: el agente respondiendo
 * en Telegram es del plan siguiente (generalizar `draftPipeline`/`autopilot`/
 * `sendMessage` está fuera de esta tarea a propósito).
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

    // 1. Ajustes del avatar.
    let settings: TelegramSettings | null
    try {
        settings = await loadTelegramSettings(avatarId)
    } catch (e) {
        console.error('[telegram webhook] loadTelegramSettings', e)
        return OK()
    }
    if (!settings || !settings.enabled) {
        return OK()
    }

    // 2. Secreto. A partir de aquí, si no coincide, el ÚNICO camino es 401 —
    //    ver cabecera del fichero sobre por qué ni el log de este bloque
    //    lleva nada de lo que acabamos de cargar.
    const header = req.headers.get('x-telegram-bot-api-secret-token')
    const secret = await loadTelegramWebhookSecret(avatarId)
    if (!secretMatches(header, secret)) {
        return new NextResponse(null, { status: 401 })
    }

    // 3. JSON mal formado (cuerpo vacío incluido).
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

    // 4. Idempotencia.
    if (await isDuplicateUpdate(avatarId, update.update_id)) {
        return OK()
    }

    // 5. Procesar.
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

    const chat = await upsertChat({
        target,
        platform: 'telegram',
        fanUuid,
        fanDisplayName,
        fanHandle,
        lastMessageAt: sentAt,
        lastFanMessageAt: sentAt,
    })
    await ingestMessage({
        organizationId: target.organizationId,
        chatId: chat.id,
        direction: 'in',
        externalMessageId: String(message.message_id),
        text: message.text ?? message.caption ?? null,
        externalCreatedAt: sentAt,
    })
    await touchFanMemory(target, fanUuid, fanDisplayName, 'telegram')
    // Nada de borradores aquí: el agente respondiendo en Telegram es del plan
    // siguiente. Esto sólo deja que exista una conversación a la que ofrecer
    // contenido de pago.
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
