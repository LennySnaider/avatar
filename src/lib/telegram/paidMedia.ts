/**
 * Entrega de contenido de pago (Telegram Stars) a una conversación.
 *
 * `deliverPaidMedia` es el núcleo SIN sesión (mismo patrón que
 * `sales.ts`/`sendMessage.ts`): no pide `ctx`, recibe el `chat` ya resuelto y
 * acotado por su llamador (hoy `sendPaidMediaFromInbox` en
 * `AgentTelegramService.ts`, con `getOrgContext` + `assertOwnedAvatar` +
 * comprobación de que la conversación es de Telegram). Así puede reutilizarse
 * mañana desde un caller sin sesión (un agente autónomo, un cron de
 * broadcast) sin arrastrar cookies ni sesión de NextAuth.
 *
 * ORDEN OBLIGATORIO (no negociable, ver brief Task 5):
 *
 *  1. Cargar el ítem y los ajustes del bot; validar que el ítem está
 *     habilitado y que el precio final (el override o el de catálogo) cae en
 *     1-25000 Stars.
 *  2. INSERTAR LA VENTA EN 'offered' — con `payload` igual a su propio id —
 *     ANTES de tocar Telegram. El evento `purchased_paid_media` que Telegram
 *     manda al comprarse sólo trae quién compró y ese `payload`, nunca a qué
 *     conversación pertenece ni qué se vendió: esta fila es la única forma de
 *     reconstruir eso. Si se insertara DESPUÉS de enviar, una compra rápida
 *     podría llegar antes de que la fila exista y el pago no tendría a qué
 *     apuntar. El peor caso del orden aquí implementado es una oferta
 *     huérfana si el envío falla después — recuperable, y no le cuesta dinero
 *     a nadie.
 *  3. Resolver el contenido: `telegram_file_id` cacheado y su
 *     `telegram_file_id_bot_id` coincide con el bot ACTUAL del avatar → se
 *     reutiliza (reenvío instantáneo, sin subir bytes). El identificador es
 *     POR BOT, no por contenido — si el avatar cambió de bot, hay que volver
 *     a subir. Si no hay caché válida: bytes reales vía `getMediaObject` y
 *     multipart con `attach://` (nunca URL — ver abajo).
 *  4. `sendPaidMedia` con `payload` (la propia venta), `caption` y
 *     `protect_content: true`. Los CUATRO límites de esa llamada (estrellas
 *     1-25000, 1-10 elementos de media, payload ≤128 bytes, caption ≤1024)
 *     los valida `client.ts` — a propósito NO se repiten aquí.
 *  5. Guardar el `file_id` fresco si hubo subida, registrar un `agent_messages`
 *     saliente y anotar el `telegram_message_id` en la venta.
 *
 * CANDADO DE ESTE FICHERO — nada después del `sendPaidMedia` que tiene éxito
 * puede LANZAR. Una vez Telegram confirma el envío, el contenido de pago ya
 * salió — es irreversible y ya podría estar comprado. Si un paso de
 * bookkeeping posterior (cachear el file_id, registrar el mensaje saliente,
 * anotar el id de mensaje en la venta) lanzara, un llamador ingenuo podría
 * interpretarlo como "el envío falló" y reintentar, lo que reenviaría el
 * mismo contenido de pago una segunda vez. Por eso cada escritura posterior
 * al envío tiene su propio `try/catch` que registra con `console.error` y
 * sigue — exactamente el criterio que `recordStarsSale` ya aplica a sus
 * contadores, trasladado aquí al lado de la entrega.
 *
 * POR QUÉ MULTIPART Y NO URL: por URL el límite es 5 MB en fotos y 20 MB en
 * el resto, y los vídeos generados lo superan con frecuencia; además
 * obligaría a que el objeto fuera público, así que el contenido de pago
 * quedaría descubrible por cualquiera que adivinase la ruta. Por multipart
 * son 10 MB y 50 MB — los mismos límites que `upsertPaidMediaItem` exige al
 * dar de alta un ítem, para que nada que no se pueda enviar llegue a
 * guardarse.
 */
import { randomUUID } from 'node:crypto'
import { orgSupabase } from '@/lib/org/orgTable'
import { getMediaObject } from '@/lib/mediaStore'
import { loadTelegramBotToken, loadTelegramSettings } from '@/lib/telegram/settings'
import { sendPaidMedia, type InputPaidMedia, type MultipartFile, type TgMessage } from '@/lib/telegram/client'

/** Conversación ya resuelta y acotada por el llamador — ver cabecera. */
export interface DeliverPaidMediaChat {
    /** `agent_chats.id`. */
    id: string
    organizationId: string
    avatarId: string
    /** `agent_chats.external_chat_id` — el chat_id numérico de Telegram, como
     *  texto (así llega de `inboxSync.upsertChat`). */
    externalChatId: string
}

export interface DeliverPaidMediaInput {
    chat: DeliverPaidMediaChat
    itemId: string
    /** Sobrescribe `telegram_paid_media_items.star_price` SÓLO para esta
     *  entrega (p.ej. un descuento puntual desde el inbox). Si se omite, se
     *  usa el precio de catálogo del ítem. */
    stars?: number
    /** Sobrescribe `telegram_paid_media_items.caption` SÓLO para esta entrega. */
    caption?: string
    soldBy: 'ai' | 'manual'
    source: 'inbox' | 'agent' | 'script' | 'broadcast'
    /** Quién autoriza el envío — `ctx.userId` para un envío manual desde el
     *  inbox, o `'autopilot'`/similar para un futuro envío automático. Mismo
     *  campo y mismo significado que `agent_messages.approved_by` en el resto
     *  del módulo de agente (ver `sendMessage.ts`/`AgentInboxService.ts`). */
    approvedBy?: string | null
}

export interface DeliverPaidMediaResult {
    saleId: string
    stars: number
    telegramMessageId: number
    /** `null` si el registro en `agent_messages` falló — ver CANDADO arriba;
     *  no invalida la entrega, que ya ocurrió. */
    agentMessageId: string | null
    /** `true` si se reutilizó `telegram_file_id` o si la subida fresca se
     *  pudo cachear; `false` si se subieron bytes y cachearlos falló (el
     *  próximo envío simplemente volverá a subir). */
    fileIdCached: boolean
}

const ATTACH_NAME = 'file'

/** Mismo criterio que `KieTaskRescueService.ts` para el mismo problema
 *  (adivinar un content-type razonable a partir del tipo de media, sin
 *  metadata de sobra guardada en la fila). Telegram identifica el tipo real
 *  por el campo `type` del JSON de `media`, no por este header — es sólo la
 *  parte multipart, no afecta a qué se sube. */
function contentTypeFor(mediaKind: 'photo' | 'video'): string {
    return mediaKind === 'video' ? 'video/mp4' : 'image/jpeg'
}

/** Nombre de fichero para el multipart de `sendPaidMedia`, coherente con
 *  `contentTypeFor` de arriba (misma extensión). Este llamador SÍ sabe si es
 *  foto o vídeo, así que se lo pasa explícito a `callMultipart` (vía
 *  `MultipartFile` en client.ts) en vez de dejar que lo derive del
 *  content-type del Blob. */
function filenameFor(mediaKind: 'photo' | 'video'): string {
    return mediaKind === 'video' ? 'video.mp4' : 'photo.jpg'
}

/**
 * `sendPaidMedia` devuelve un `Message` de Telegram cuyo campo `paid_media`
 * (tipo `PaidMediaInfo`, documentado en
 * https://core.telegram.org/bots/api#paidmediainfo) trae el `file_id`
 * reutilizable. `TgMessage` (client.ts) ya lo declara — es un campo real de
 * la respuesta, no una necesidad de un único caller, así que se amplió el
 * tipo compartido (arreglo agrupado previo a la prueba con dinero real) en
 * vez de leerlo aquí con un cast local.
 *
 * `PaidMediaPreview` (sin `photo`/`video`, para quien aún no pagó) existe en
 * la API pero no debería aparecer aquí: esta respuesta es la que Telegram le
 * da al BOT que acaba de enviar, no la vista de un comprador. Si algún día
 * apareciera igualmente (`entry.type === 'preview'`), `extractFileId`
 * devuelve `null` con seguridad — ninguna de las dos ramas de abajo la cubre.
 */
function extractFileId(message: TgMessage): string | null {
    const entry = message.paid_media?.paid_media?.[0]
    if (!entry) return null
    if (entry.type === 'photo' && entry.photo.length > 0) {
        // Telegram manda varios tamaños del mismo file_id lógico; el último
        // es el de mayor resolución (mismo orden que usa el resto de la Bot API).
        return entry.photo[entry.photo.length - 1].file_id
    }
    if (entry.type === 'video') {
        return entry.video.file_id
    }
    return null
}

/** Fila mínima de `telegram_paid_media_items` que necesita la entrega —
 *  deliberadamente MÁS ESTRECHA que el DTO de galería de
 *  `AgentTelegramService.ts` (que tiene su propio lector con `ctx`, para su
 *  propio propósito). Mismo patrón que las dos variantes de `settings.ts`. */
interface PaidMediaItemForDelivery {
    id: string
    enabled: boolean
    starPrice: number
    mediaKind: 'photo' | 'video'
    storagePath: string
    storageProvider: string | null
    caption: string | null
    telegramFileId: string | null
    telegramFileIdBotId: number | null
    offersCount: number
}

async function loadItemForDelivery(
    organizationId: string,
    avatarId: string,
    itemId: string,
): Promise<PaidMediaItemForDelivery | null> {
    const { data, error } = await orgSupabase()
        .from('telegram_paid_media_items')
        .select(
            'id, enabled, star_price, media_kind, storage_path, storage_provider, caption, telegram_file_id, telegram_file_id_bot_id, offers_count',
        )
        .eq('organization_id', organizationId)
        .eq('avatar_id', avatarId)
        .eq('id', itemId)
        .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null
    return {
        id: data.id,
        enabled: data.enabled,
        starPrice: data.star_price,
        // El check constraint de la migración (Task 1) sólo permite estos dos.
        mediaKind: data.media_kind as 'photo' | 'video',
        storagePath: data.storage_path,
        storageProvider: data.storage_provider,
        caption: data.caption,
        telegramFileId: data.telegram_file_id,
        telegramFileIdBotId: data.telegram_file_id_bot_id,
        offersCount: data.offers_count,
    }
}

export async function deliverPaidMedia(input: DeliverPaidMediaInput): Promise<DeliverPaidMediaResult> {
    const { chat, itemId, caption, soldBy, source, approvedBy } = input

    // PASO 1 — cargar el ítem y los ajustes; validar habilitado y precio.
    const item = await loadItemForDelivery(chat.organizationId, chat.avatarId, itemId)
    if (!item) throw new Error('Contenido no encontrado en este avatar.')
    if (!item.enabled) throw new Error('Este contenido está deshabilitado y no se puede vender.')

    const stars = input.stars ?? item.starPrice
    if (!Number.isInteger(stars) || stars < 1 || stars > 25_000) {
        throw new RangeError(`El precio debe ser un entero entre 1 y 25000 Stars (recibido: ${stars}).`)
    }

    const settings = await loadTelegramSettings(chat.avatarId)
    if (!settings || !settings.enabled) {
        throw new Error('Este avatar no tiene un bot de Telegram conectado.')
    }
    const token = await loadTelegramBotToken(chat.avatarId)
    if (!token) throw new Error('Este avatar no tiene un bot de Telegram conectado.')

    const telegramChatId = Number(chat.externalChatId)
    if (!Number.isFinite(telegramChatId)) {
        throw new Error(`external_chat_id inválido para Telegram: "${chat.externalChatId}".`)
    }

    // PASO 2 — la venta se inserta EN ESTADO OFRECIDO antes de enviar nada.
    // Ver cabecera del fichero: es el único ancla que el webhook de compras
    // podrá usar, y llegar aquí DESPUÉS del envío dejaría una compra rápida
    // sin fila que la explique.
    const saleId = randomUUID()
    const { error: insertError } = await orgSupabase()
        .from('telegram_stars_sales')
        .insert({
            id: saleId,
            organization_id: chat.organizationId,
            avatar_id: chat.avatarId,
            chat_id: chat.id,
            item_id: item.id,
            payload: saleId,
            telegram_user_id: telegramChatId,
            stars,
            sold_by: soldBy,
            source,
            // Explícito aunque coincida con el default de la columna: es la
            // línea que hace visible la invariante del PASO 2 (nace ofrecida).
            status: 'offered',
        })
    if (insertError) throw new Error(`No se pudo registrar la oferta: ${insertError.message}`)

    // Estadística de galería, no fuente de verdad — mismo criterio que
    // `bumpItemCounters` en sales.ts: si esto falla, no aborta la entrega.
    // El `if (error) throw` de dentro del try NO es contradictorio con "no
    // lanzar": supabase-js RESUELVE con `{error}` en vez de rechazar la
    // promesa, así que sin este chequeo un fallo de Postgrest pasaría
    // desapercibido incluso para el propio `console.warn` de abajo.
    try {
        const { error: bumpError } = await orgSupabase()
            .from('telegram_paid_media_items')
            .update({ offers_count: item.offersCount + 1, updated_at: new Date().toISOString() })
            .eq('organization_id', chat.organizationId)
            .eq('id', item.id)
        if (bumpError) throw new Error(bumpError.message)
    } catch (e) {
        console.warn(`[paidMedia] no se pudo incrementar offers_count de ${item.id}:`, e)
    }

    // PASO 3 — resolver el contenido: file_id cacheado (mismo bot) o bytes frescos.
    const canReuse = Boolean(item.telegramFileId) && item.telegramFileIdBotId === settings.botId
    const mediaRef = canReuse ? item.telegramFileId! : `attach://${ATTACH_NAME}`
    const mediaEntry: InputPaidMedia =
        item.mediaKind === 'video' ? { type: 'video', media: mediaRef } : { type: 'photo', media: mediaRef }

    let files: Record<string, MultipartFile> | undefined
    if (!canReuse) {
        const bytes = await getMediaObject({ path: item.storagePath, provider: item.storageProvider })
        files = {
            [ATTACH_NAME]: {
                blob: new Blob([bytes], { type: contentTypeFor(item.mediaKind) }),
                filename: filenameFor(item.mediaKind),
            },
        }
    }

    // PASO 4 — enviar. Los 4 límites de la llamada los valida client.ts; no
    // se repiten aquí (ver cabecera).
    const message = await sendPaidMedia(token, {
        chat_id: telegramChatId,
        star_count: stars,
        media: [mediaEntry],
        files,
        payload: saleId,
        caption: caption ?? item.caption ?? undefined,
        protect_content: true,
    })

    // PASO 5 — a partir de aquí el contenido YA SE ENTREGÓ: ver CANDADO en la
    // cabecera, nada de lo siguiente puede lanzar.
    let fileIdCached = canReuse
    if (!canReuse) {
        const freshFileId = extractFileId(message)
        if (freshFileId) {
            try {
                const { error: cacheError } = await orgSupabase()
                    .from('telegram_paid_media_items')
                    .update({
                        telegram_file_id: freshFileId,
                        telegram_file_id_bot_id: settings.botId,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('organization_id', chat.organizationId)
                    .eq('id', item.id)
                if (cacheError) throw new Error(cacheError.message)
                fileIdCached = true
            } catch (e) {
                console.error(`[paidMedia] no se pudo cachear telegram_file_id del ítem ${item.id}:`, e)
            }
        }
    }

    let agentMessageId: string | null = null
    try {
        const { data: inserted, error } = await orgSupabase()
            .from('agent_messages')
            .insert({
                organization_id: chat.organizationId,
                chat_id: chat.id,
                direction: 'out',
                external_message_id: String(message.message_id),
                text: caption ?? item.caption ?? null,
                media: [{ kind: item.mediaKind, itemId: item.id, stars }],
                status: 'sent',
                approved_by: approvedBy ?? null,
                sent_at: new Date().toISOString(),
            })
            .select('id')
            .single()
        if (error) throw new Error(error.message)
        agentMessageId = inserted?.id ?? null

        const { error: touchError } = await orgSupabase()
            .from('agent_chats')
            .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('organization_id', chat.organizationId)
            .eq('id', chat.id)
        if (touchError) throw new Error(touchError.message)
    } catch (e) {
        // `agentMessageId` YA quedó asignado si sólo falló el touch del chat
        // (una asignación anterior a un throw no se deshace) — un fallo aquí
        // es puramente informativo, la entrega en sí no depende de esto.
        console.error(`[paidMedia] no se pudo registrar agent_messages para la venta ${saleId}:`, e)
    }

    try {
        const { error: saleUpdateError } = await orgSupabase()
            .from('telegram_stars_sales')
            .update({ telegram_message_id: message.message_id, updated_at: new Date().toISOString() })
            .eq('organization_id', chat.organizationId)
            .eq('id', saleId)
        if (saleUpdateError) throw new Error(saleUpdateError.message)
    } catch (e) {
        console.error(`[paidMedia] no se pudo guardar telegram_message_id en la venta ${saleId}:`, e)
    }

    return {
        saleId,
        stars,
        telegramMessageId: message.message_id,
        agentMessageId,
        fileIdCached,
    }
}
