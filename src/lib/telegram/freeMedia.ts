/**
 * Entrega de un teaser GRATIS (Telegram) a una conversación — sin cobro, sin
 * venta, sin `payload`. Mismo perfil sin sesión que `paidMedia.ts` (recibe el
 * `chat` ya resuelto y acotado por su llamador) y misma disciplina de pasos,
 * recortada donde el diseño de "gratis" es más simple que el de pago:
 *
 *  1. Cargar el ítem (acotado por `organization_id` + `avatar_id`) y
 *     validar: existe, está `enabled`, y es `is_free` — un ítem de pago NUNCA
 *     puede salir por este camino, aunque el llamador se equivoque de id.
 *     Cargar también los ajustes del bot y su token; sin bot conectado no
 *     hay a quién mandarle nada.
 *  2. Resolver el contenido: `telegram_file_id` cacheado y su
 *     `telegram_file_id_bot_id` coincide con el bot ACTUAL del avatar → se
 *     reutiliza (reenvío instantáneo). Si no hay caché válida: bytes reales
 *     vía `getMediaObject` y multipart con `attach://` — mismo criterio que
 *     `paidMedia.ts` (nunca URL: público filtrable por cualquiera que
 *     adivinase la ruta, y los límites por URL son más bajos).
 *  3. `sendPhoto` o `sendVideo` (según `media_kind`) con `caption` y
 *     `protect_content: false` — a diferencia del contenido de pago, un
 *     teaser gratis NO se protege: es gancho, no el producto.
 *  4. Bookkeeping posterior al envío: cachear el `file_id` fresco si hubo
 *     subida, incrementar `free_sends_count`, y registrar un `agent_messages`
 *     saliente con `media: [{type: 'free_media', itemId}]` — esa fila es la
 *     ÚNICA fuente de verdad de "a este fan ya se le mandó este ítem" (ver
 *     `filterFreeCandidates` en offerGate.ts, que la Tarea 4 alimenta con el
 *     historial del chat). Sin venta que anclar, no hace falta insertar nada
 *     ANTES de enviar — a diferencia de `deliverPaidMedia`, aquí el PASO 1 no
 *     tiene una fila que crear de antemano.
 *
 * CANDADO DE ESTE FICHERO — nada después del `sendPhoto`/`sendVideo` que
 * tiene éxito puede LANZAR. Mismo razonamiento que `paidMedia.ts`: el
 * contenido ya salió, es irreversible, y un llamador ingenuo que viera
 * lanzar un paso de bookkeeping posterior podría reintentar y reenviar el
 * mismo teaser dos veces — justo lo que `filterFreeCandidates` existe para
 * evitar. Cada escritura posterior al envío tiene su propio `try/catch`.
 *
 * `messageId` SE GENERA ANTES de intentar el insert (mismo patrón que
 * `saleId` en `paidMedia.ts`), a propósito: el contrato de
 * `DeliverFreeMediaResult` lo declara `string` (no `string | null`) porque
 * quien llama esta función — a diferencia del inbox manual de contenido de
 * pago, que puede permitirse mostrar "no se pudo registrar el mensaje" — es
 * sobre todo el autopilot, que necesita un id con el que seguir aunque el
 * INSERT de bookkeeping falle. Si el insert falla de verdad, el id devuelto
 * no corresponde a ninguna fila real — ver el `console.error` de ese paso,
 * que es la señal de que pasó.
 */
import { randomUUID } from 'node:crypto'
import { orgSupabase } from '@/lib/org/orgTable'
import { getMediaObject } from '@/lib/mediaStore'
import {
    loadTelegramBotToken,
    loadTelegramSettings,
} from '@/lib/telegram/settings'
import {
    pickFileId,
    sendPhoto,
    sendVideo,
    type MultipartFile,
} from '@/lib/telegram/client'

/** Conversación ya resuelta y acotada por el llamador — mismo shape que
 *  `DeliverPaidMediaChat` (paidMedia.ts). */
export interface DeliverFreeMediaChat {
    /** `agent_chats.id`. */
    id: string
    organizationId: string
    avatarId: string
    /** `agent_chats.external_chat_id` — el chat_id numérico de Telegram, como texto. */
    externalChatId: string
}

export interface DeliverFreeMediaInput {
    chat: DeliverFreeMediaChat
    itemId: string
    /** Sobrescribe `telegram_paid_media_items.caption` SÓLO para esta entrega. */
    caption?: string
    /** `'agent'` = lo disparó el autopilot (motor de oferta / borrador
     *  auto-enviado); `'inbox'` = un humano lo mandó a mano desde el panel.
     *  De aquí sale `agent_messages.approved_by` cuando `approvedBy` no
     *  viene — ver PASO 4 más abajo. */
    source: 'agent' | 'inbox'
    /** Quién aprobó el mensaje que arrastra este teaser: `'autopilot'` o el id
     *  del humano que le dio a enviar. Mismo campo y mismo significado que en
     *  `deliverPaidMedia`. Sin él, un borrador con teaser que aprueba UNA
     *  PERSONA quedaba registrado como `'autopilot'` sólo porque el envío lo
     *  ejecutó `sendAgentMessage`: la atribución mentía. Ausente = se decide
     *  por `source`, como antes. */
    approvedBy?: string | null
}

export interface DeliverFreeMediaResult {
    /** Id del `agent_messages` saliente — ver nota sobre generación
     *  anticipada en la cabecera del fichero. */
    messageId: string
    telegramMessageId: number
    /** ¿Queda un `telegram_file_id` válido para el próximo envío? `true` si se
     *  reutilizó el cacheado o si la subida fresca se pudo cachear; `false`
     *  sólo si se subieron bytes y cachearlos falló (el próximo envío volverá
     *  a subir). Se llamaba `reusedFileId` y el nombre MENTÍA: también valía
     *  `true` tras una subida nueva, donde no se reutilizó nada. Mismo nombre
     *  y mismo criterio que `fileIdCached` en `paidMedia.ts`. */
    fileIdCached: boolean
}

const ATTACH_NAME = 'file'

/** Mismo criterio que `contentTypeFor` en `paidMedia.ts` para el mismo
 *  problema: adivinar un content-type razonable a partir del tipo de media. */
function contentTypeFor(mediaKind: 'photo' | 'video'): string {
    return mediaKind === 'video' ? 'video/mp4' : 'image/jpeg'
}

/** Mismo criterio que `filenameFor` en `paidMedia.ts`. */
function filenameFor(mediaKind: 'photo' | 'video'): string {
    return mediaKind === 'video' ? 'video.mp4' : 'photo.jpg'
}

/** Fila mínima de `telegram_paid_media_items` que necesita la entrega
 *  gratis — deliberadamente más estrecha que la de `paidMedia.ts` (no
 *  necesita `star_price` ni `offers_count`, pero sí `is_free` y
 *  `free_sends_count`, que aquélla no toca). */
interface FreeMediaItemForDelivery {
    id: string
    enabled: boolean
    isFree: boolean
    mediaKind: 'photo' | 'video'
    storagePath: string
    storageProvider: string | null
    caption: string | null
    telegramFileId: string | null
    telegramFileIdBotId: number | null
    freeSendsCount: number
}

async function loadFreeItemForDelivery(
    organizationId: string,
    avatarId: string,
    itemId: string,
): Promise<FreeMediaItemForDelivery | null> {
    const { data, error } = await orgSupabase()
        .from('telegram_paid_media_items')
        .select(
            'id, enabled, is_free, media_kind, storage_path, storage_provider, caption, telegram_file_id, telegram_file_id_bot_id, free_sends_count',
        )
        .eq('organization_id', organizationId)
        .eq('avatar_id', avatarId)
        .eq('id', itemId)
        .maybeSingle()
    if (error) {
        // Lectura ANTES de enviar nada — un fallo aquí se ve y se lanza,
        // nunca se traga (ver global-constraints.md: "no silent failures").
        console.error(`[freeMedia] no se pudo leer el ítem ${itemId}:`, error)
        throw new Error(`Supabase: ${error.message}`)
    }
    if (!data) return null
    return {
        id: data.id,
        enabled: data.enabled,
        isFree: data.is_free,
        // El check constraint de la migración (Task 1) sólo permite estos dos.
        mediaKind: data.media_kind as 'photo' | 'video',
        storagePath: data.storage_path,
        storageProvider: data.storage_provider,
        caption: data.caption,
        telegramFileId: data.telegram_file_id,
        telegramFileIdBotId: data.telegram_file_id_bot_id,
        freeSendsCount: data.free_sends_count,
    }
}

export async function deliverFreeMedia(
    input: DeliverFreeMediaInput,
): Promise<DeliverFreeMediaResult> {
    const { chat, itemId, caption, source, approvedBy } = input

    // PASO 1 — cargar el ítem y los ajustes; validar habilitado y gratis.
    const item = await loadFreeItemForDelivery(
        chat.organizationId,
        chat.avatarId,
        itemId,
    )
    if (!item) throw new Error('Contenido no encontrado en este avatar.')
    if (!item.enabled) throw new Error('Este contenido está deshabilitado.')
    if (!item.isFree) throw new Error('El ítem no es gratis')

    const settings = await loadTelegramSettings(chat.avatarId)
    if (!settings || !settings.enabled) {
        throw new Error('Este avatar no tiene un bot de Telegram conectado.')
    }
    const token = await loadTelegramBotToken(chat.avatarId)
    if (!token)
        throw new Error('Este avatar no tiene un bot de Telegram conectado.')

    const telegramChatId = Number(chat.externalChatId)
    if (!Number.isFinite(telegramChatId)) {
        throw new Error(
            `external_chat_id inválido para Telegram: "${chat.externalChatId}".`,
        )
    }

    // PASO 2 — resolver el contenido: file_id cacheado (mismo bot) o bytes frescos.
    const canReuse =
        Boolean(item.telegramFileId) &&
        item.telegramFileIdBotId === settings.botId
    const mediaRef = canReuse ? item.telegramFileId! : `attach://${ATTACH_NAME}`

    let files: Record<string, MultipartFile> | undefined
    if (!canReuse) {
        const bytes = await getMediaObject({
            path: item.storagePath,
            provider: item.storageProvider,
        })
        files = {
            [ATTACH_NAME]: {
                blob: new Blob([bytes], {
                    type: contentTypeFor(item.mediaKind),
                }),
                filename: filenameFor(item.mediaKind),
            },
        }
    }

    // Límite de la Bot API (1024) — se aplica aquí y no sólo en client.ts
    // porque este mismo valor recortado es el que se guarda como `text` del
    // `agent_messages` en el PASO 4 (ver cabecera del fichero).
    const finalCaption =
        (caption ?? item.caption ?? '').slice(0, 1024) || undefined

    // PASO 3 — enviar. `protect_content: false`: un teaser gratis es gancho,
    // no el producto (a diferencia de `deliverPaidMedia`).
    const send = item.mediaKind === 'video' ? sendVideo : sendPhoto
    const message = await send(token, {
        chat_id: telegramChatId,
        media: mediaRef,
        files,
        caption: finalCaption,
        protect_content: false,
    })

    // PASO 4 — a partir de aquí el contenido YA SE ENTREGÓ: ver CANDADO en la
    // cabecera, nada de lo siguiente puede lanzar.
    let fileIdCached = canReuse
    if (!canReuse) {
        const freshFileId = pickFileId(message)
        if (freshFileId) {
            try {
                const { error } = await orgSupabase()
                    .from('telegram_paid_media_items')
                    .update({
                        telegram_file_id: freshFileId,
                        telegram_file_id_bot_id: settings.botId,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('organization_id', chat.organizationId)
                    .eq('id', item.id)
                if (error) throw new Error(error.message)
                fileIdCached = true
            } catch (e) {
                console.error(
                    `[freeMedia] no se pudo cachear telegram_file_id del ítem ${item.id}:`,
                    e,
                )
            }
        }
    }

    // Estadística de galería, no fuente de verdad — mismo criterio que
    // `offers_count` en `paidMedia.ts`: si esto falla, no invalida la entrega.
    try {
        const { error } = await orgSupabase()
            .from('telegram_paid_media_items')
            .update({
                free_sends_count: item.freeSendsCount + 1,
                updated_at: new Date().toISOString(),
            })
            .eq('organization_id', chat.organizationId)
            .eq('id', item.id)
        if (error) throw new Error(error.message)
    } catch (e) {
        console.warn(
            `[freeMedia] no se pudo incrementar free_sends_count de ${item.id}:`,
            e,
        )
    }

    // `messageId` ya está fijado (ver cabecera) — lo que puede fallar aquí es
    // sólo la escritura, no el valor devuelto.
    const messageId = randomUUID()
    // ESTA FILA ES LA ÚNICA PRUEBA de que a este fan ya se le mandó este
    // teaser (`filterFreeCandidates` la lee desde el historial del chat). Si
    // se pierde, el motor volverá a elegir el mismo ítem y el fan lo recibirá
    // dos veces — la única regla que "gratis" tiene. Por eso se REINTENTA una
    // vez ante un parpadeo de la base, con el MISMO id: el reintento es
    // idempotente por clave primaria (si la primera sí escribió y sólo se
    // perdió la respuesta, el segundo insert choca y no duplica nada).
    // El CANDADO sigue intacto: nada de esto lanza hacia fuera.
    const insertOutgoingRow = () =>
        orgSupabase()
            .from('agent_messages')
            .insert({
                id: messageId,
                organization_id: chat.organizationId,
                chat_id: chat.id,
                direction: 'out',
                status: 'sent',
                text: finalCaption ?? null,
                media: [{ type: 'free_media', itemId: item.id }],
                external_message_id: String(message.message_id),
                sent_at: new Date().toISOString(),
                approved_by: approvedBy !== undefined ? approvedBy : source === 'inbox' ? null : 'autopilot',
                // MARCA DE ENTREGA DE MEDIA. Esta fila no es un mensaje que la
                // IA haya escrito: es el registro de la foto que acompañó a
                // otro mensaje. El límite diario del autopilot cuenta mensajes
                // enviados, y sin esta marca un teaser gastaba cupo dos veces
                // (el texto y su propia foto). Ver `maybeAutopilotSendScheduled`.
                generated_by: { kind: 'media_delivery' },
            })
    try {
        let { error } = await insertOutgoingRow()
        if (error) {
            console.warn(
                `[freeMedia] primer intento de registrar agent_messages ${messageId} fallido, reintentando:`,
                error,
            )
            ;({ error } = await insertOutgoingRow())
        }
        if (error) throw new Error(error.message)

        const { error: touchError } = await orgSupabase()
            .from('agent_chats')
            .update({
                last_message_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('organization_id', chat.organizationId)
            .eq('id', chat.id)
        if (touchError) throw new Error(touchError.message)
    } catch (e) {
        // Un fallo aquí (insert o touch) es puramente informativo — el envío
        // ya ocurrió y `messageId` se devuelve igual (ver cabecera).
        console.error(
            `[freeMedia] no se pudo registrar agent_messages/last_message_at para ${messageId}:`,
            e,
        )
    }

    return {
        messageId,
        telegramMessageId: message.message_id,
        fileIdCached,
    }
}
