/**
 * Cliente HTTP mínimo para la Bot API de Telegram. SIN dependencias: `fetch`,
 * `FormData` y `Blob` son nativos en este runtime (Next.js 15 / Node 22).
 *
 * Verificado en la documentación oficial (no inventado):
 *  - Base: `https://api.telegram.org/bot<token>/<método>`.
 *  - Respuesta siempre `{ok, result?, description?, error_code?, parameters?}`;
 *    los 429 traen `parameters.retry_after` en segundos.
 *  - `sendPaidMedia`: `star_count` 1-25000, `media` 1-10 elementos, `payload`
 *    0-128 bytes (no se le muestra al usuario), `caption` 0-1024 caracteres.
 *  - Subida por URL: 5 MB fotos / 20 MB el resto. Por multipart: 10 MB / 50 MB.
 *    Por `file_id` no hay límite, pero es POR BOT y no se transfiere entre bots.
 *  - Multipart: los `media[].media` que empiezan por `attach://<nombre>` deben
 *    tener ese `<nombre>` como campo del FormData.
 *
 * CANDADO DE ESTE FICHERO — el token NUNCA aparece en un mensaje de error:
 * la URL de cualquier llamada lo lleva embebido (`.../bot<token>/método`), así
 * que aquí NUNCA se construye un log ni un error a partir de la URL. Los
 * errores llevan `method` (p.ej. "sendMessage"), nunca la URL. Y como defensa
 * extra — por si el runtime llegara a incrustar la URL en el `message` de un
 * error de red de `fetch` — `redactToken` se pasa sobre cualquier texto que
 * venga de una excepción ajena antes de reenviarlo.
 */

const TELEGRAM_API_BASE = 'https://api.telegram.org'

/** Quita cualquier aparición literal del token de un texto ajeno (p.ej. el
 *  `message` de una excepción de `fetch`) antes de meterlo en un error propio. */
function redactToken(token: string, text: string): string {
    return token ? text.split(token).join('***') : text
}

/**
 * Error de la Bot API. `code` es el `error_code` de Telegram (400, 401, 403,
 * 404, 429…) salvo para fallos de RED (fetch no llegó a obtener respuesta),
 * donde vale `0` — no hay `error_code` de Telegram que reportar.
 */
export class TelegramApiError extends Error {
    readonly method: string
    readonly code: number
    readonly description: string
    readonly retryAfter?: number

    constructor(params: {
        method: string
        code: number
        description: string
        retryAfter?: number
    }) {
        super(`Telegram API (${params.method}) error ${params.code}: ${params.description}`)
        this.name = 'TelegramApiError'
        this.method = params.method
        this.code = params.code
        this.description = params.description
        this.retryAfter = params.retryAfter
    }
}

/** Envoltorio de respuesta de la Bot API (idéntico para éxito y error). */
interface TelegramEnvelope<T> {
    ok: boolean
    result?: T
    description?: string
    error_code?: number
    parameters?: { retry_after?: number; migrate_to_chat_id?: number }
}

/** Usuario de Telegram. Los campos `can_*`/`supports_inline_queries` sólo
 *  llegan cuando este objeto es el resultado de `getMe`. */
export interface TelegramUser {
    id: number
    is_bot: boolean
    first_name: string
    last_name?: string
    username?: string
    can_join_groups?: boolean
    can_read_all_group_messages?: boolean
    supports_inline_queries?: boolean
}

interface TgChat {
    id: number
    type: 'private' | 'group' | 'supergroup' | 'channel'
    username?: string
    first_name?: string
    last_name?: string
    title?: string
}

/** Un tamaño de foto dentro de `TgPaidMedia` — sólo lo que este canal usa hoy
 *  (cachear el `file_id` reutilizable tras el primer envío). */
interface TgPhotoSize {
    file_id: string
    file_unique_id: string
    width: number
    height: number
    file_size?: number
}

/** Un vídeo dentro de `TgPaidMedia` — mismo criterio que `TgPhotoSize`. */
interface TgVideo {
    file_id: string
    file_unique_id: string
    width: number
    height: number
    duration: number
    file_size?: number
}

/**
 * Un elemento de `PaidMediaInfo.paid_media` (documentado en
 * https://core.telegram.org/bots/api#paidmedia), RECORTADO a lo que este
 * canal puede recibir de vuelta — no las variantes que existen en la API.
 * Verificado contra la documentación oficial (no inventado): el union real de
 * Telegram tiene CUATRO miembros (`PaidMediaPreview`, `PaidMediaPhoto`,
 * `PaidMediaVideo`, `PaidMediaLivePhoto`); aquí sólo van tres.
 * `PaidMediaLivePhoto` se omite a propósito: `InputPaidMedia` (más abajo) sólo
 * sabe ENVIAR `photo`/`video`, así que la respuesta a NUESTRO `sendPaidMedia`
 * nunca puede traer ese tipo — igual que `preview`, que es la vista de un
 * comprador que TODAVÍA no pagó y por tanto tampoco puede volver en la
 * respuesta al BOT que acaba de enviar. Se declara de todos modos (mismo
 * criterio que `TgMessage`: "sólo los campos que este canal usa hoy") para
 * que `extractFileId` (paidMedia.ts) pueda descartarla con seguridad si algún
 * día apareciera igual; un `type` que no sea NINGUNO de los tres de aquí
 * abajo (incluido `live_photo`) cae por el mismo camino defensivo.
 */
type TgPaidMedia =
    | { type: 'preview' }
    | { type: 'photo'; photo: TgPhotoSize[] }
    | { type: 'video'; video: TgVideo }

/** `PaidMediaInfo`, documentado en
 *  https://core.telegram.org/bots/api#paidmediainfo — lo que trae
 *  `TgMessage.paid_media` tras un `sendPaidMedia` con éxito. */
interface TgPaidMediaInfo {
    star_count: number
    paid_media: TgPaidMedia[]
}

/**
 * Mensaje de Telegram — sólo los campos que este canal usa hoy (texto y
 * multimedia con Stars). `allowed_updates` de este plan es únicamente
 * `['message', 'purchased_paid_media']`; el plan siguiente, al ampliarlo,
 * ampliará también esta forma.
 */
export interface TgMessage {
    message_id: number
    date: number
    chat: TgChat
    from?: TelegramUser
    text?: string
    caption?: string
    /** Presente cuando este mensaje es la respuesta de `sendPaidMedia` — trae
     *  el/los `file_id` reutilizables del contenido recién enviado. Campo
     *  real de la API (`Message.paid_media`); `paidMedia.ts` lo lee para
     *  cachear el `file_id` sin necesitar un cast local. */
    paid_media?: TgPaidMediaInfo
    /** Presente cuando este mensaje es la respuesta de `sendPhoto` (o de un
     *  `sendMessage`/update con foto adjunta) — varios tamaños del mismo
     *  `file_id` lógico, ASCENDENTE por resolución (el último es el más
     *  grande). Campo real de la API (`Message.photo`). */
    photo?: TgPhotoSize[]
    /** Presente cuando este mensaje es la respuesta de `sendVideo`. Campo
     *  real de la API (`Message.video`). */
    video?: TgVideo
}

/**
 * `file_id` reutilizable de un `TgMessage` de foto/vídeo sin cobro —
 * equivalente de `extractFileId` (paidMedia.ts) pero leyendo `photo`/`video`
 * directamente en vez de `paid_media` (que sólo trae `sendPaidMedia`).
 * `freeMedia.ts` (Tarea 3) lo usa para cachear el `file_id` tras un envío en
 * bytes frescos. Prioriza `photo` sobre `video` porque un `TgMessage` real
 * sólo trae uno de los dos a la vez — el orden aquí es sólo defensivo.
 */
export function pickFileId(message: TgMessage): string | null {
    if (message.photo && message.photo.length > 0) {
        // Telegram manda varios tamaños del mismo file_id lógico; el último
        // es el de mayor resolución (mismo criterio que `extractFileId`).
        return message.photo[message.photo.length - 1].file_id
    }
    if (message.video) {
        return message.video.file_id
    }
    return null
}

/** Update `purchased_paid_media`: alguien compró el contenido identificado
 *  por `paid_media_payload` (el mismo `payload` que se mandó en `sendPaidMedia`). */
export interface PaidMediaPurchased {
    from: TelegramUser
    paid_media_payload: string
}

/**
 * Update entrante (webhook o `getUpdates`). Sólo las dos variantes que este
 * plan suscribe vía `allowed_updates` — ver nota de `TgMessage`.
 */
export interface TelegramUpdate {
    update_id: number
    message?: TgMessage
    purchased_paid_media?: PaidMediaPurchased
}

export interface TelegramWebhookInfo {
    url: string
    has_custom_certificate: boolean
    pending_update_count: number
    ip_address?: string
    last_error_date?: number
    last_error_message?: string
    last_synchronization_error_date?: number
    max_connections?: number
    allowed_updates?: string[]
}

/** Resultado de `getMyStarBalance`. */
export interface TelegramStarAmount {
    amount: number
    nanostar_amount?: number
}

export interface InputPaidMediaPhoto {
    type: 'photo'
    /** `file_id`, URL http(s), o `attach://<nombre>` (multipart). */
    media: string
}

export interface InputPaidMediaVideo {
    type: 'video'
    media: string
    thumbnail?: string
    width?: number
    height?: number
    duration?: number
    supports_streaming?: boolean
}

export type InputPaidMedia = InputPaidMediaPhoto | InputPaidMediaVideo

/** Fallo de RED (fetch no obtuvo respuesta): nunca se construye a partir de
 *  la URL, y el texto de la excepción ajena pasa por `redactToken` primero. */
function networkError(token: string, method: string, err: unknown): TelegramApiError {
    const raw = err instanceof Error ? err.message : String(err)
    return new TelegramApiError({
        method,
        code: 0,
        description: `fallo de red: ${redactToken(token, raw)}`,
    })
}

/** Interpreta el envoltorio `{ok, result, description, error_code, parameters}`.
 *  Telegram usa el mismo envoltorio para éxito y error sea cual sea el status
 *  HTTP, así que `ok` manda — el status sólo se usa como respaldo si el
 *  cuerpo ni siquiera es JSON. */
async function parseResponse<T>(method: string, res: Response): Promise<T> {
    let body: TelegramEnvelope<T>
    try {
        body = (await res.json()) as TelegramEnvelope<T>
    } catch {
        throw new TelegramApiError({
            method,
            code: res.status,
            description: `respuesta no-JSON de Telegram (status ${res.status})`,
        })
    }
    if (!body.ok) {
        throw new TelegramApiError({
            method,
            code: body.error_code ?? res.status,
            description: body.description ?? 'error desconocido',
            retryAfter: body.parameters?.retry_after,
        })
    }
    return body.result as T
}

/** Transporte JSON — el camino normal para todo lo que no sube bytes. */
async function callJson<T>(token: string, method: string, params?: Record<string, unknown>): Promise<T> {
    let res: Response
    try {
        res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/${method}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params ?? {}),
        })
    } catch (err) {
        throw networkError(token, method, err)
    }
    return parseResponse<T>(method, res)
}

/** Extensión de fichero por content-type — mismo criterio que
 *  `contentTypeFor` en `paidMedia.ts` para el problema inverso: sólo lo que
 *  de verdad circula por este canal hoy, con `bin` de respaldo para
 *  cualquier otra cosa. */
const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
}

/** Nombre de fichero razonable a partir del content-type de un `Blob`, para
 *  cuando el llamador de `callMultipart` no tiene uno mejor que darle. Sólo
 *  hace falta que sea plausible y con una extensión coherente: Telegram
 *  identifica el tipo real de cada `media[]` por su propio campo `type` en el
 *  JSON (ver `SendPaidMediaParams`), no por este nombre. */
function filenameForContentType(contentType: string): string {
    const ext = EXTENSION_BY_CONTENT_TYPE[contentType] ?? 'bin'
    return `file.${ext}`
}

/** Un fichero a subir por multipart: un `Blob` a secas cuando el llamador no
 *  tiene un nombre mejor que darle (`callMultipart` lo deriva de su
 *  `type` — ver `filenameForContentType`), o el par `{blob, filename}` cuando
 *  sí lo sabe (p.ej. `paidMedia.ts` ya sabe si es foto o vídeo). */
export type MultipartFile = Blob | { blob: Blob; filename: string }

/**
 * Transporte multipart — para subir bytes. Los campos que no son texto plano
 * (arrays/objetos, p.ej. `media`) van como STRING con JSON dentro, tal como
 * exige la Bot API cuando se mezclan parámetros con ficheros adjuntos.
 *
 * Cada fichero lleva SIEMPRE un nombre en su `Content-Disposition`
 * (`form.append(name, blob, filename)`, nunca los dos argumentos a secas):
 * sin él hay partes que Telegram puede no reconocer como una subida de
 * fichero real, y ese fallo sólo se ve contra la API real, no en ningún test
 * local — es justo lo que hacía esta función antes de este arreglo.
 */
async function callMultipart<T>(
    token: string,
    method: string,
    fields: Record<string, string>,
    files: Record<string, MultipartFile>,
): Promise<T> {
    const form = new FormData()
    for (const [key, value] of Object.entries(fields)) form.append(key, value)
    for (const [name, file] of Object.entries(files)) {
        const blob = file instanceof Blob ? file : file.blob
        const filename = file instanceof Blob ? filenameForContentType(blob.type) : file.filename
        form.append(name, blob, filename)
    }

    let res: Response
    try {
        res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/${method}`, { method: 'POST', body: form })
    } catch (err) {
        throw networkError(token, method, err)
    }
    return parseResponse<T>(method, res)
}

export async function getMe(token: string): Promise<TelegramUser> {
    return callJson<TelegramUser>(token, 'getMe')
}

/** Respaldo local cuando `NEXT_PUBLIC_APP_URL` no está definida — mismo
 *  puerto que usa `npm run dev` (ver CLAUDE.md). */
const APP_BASE_URL_FALLBACK = 'http://localhost:3030'

/**
 * Dirección a la que Telegram debe entregar los updates de un avatar.
 *
 * Vive aquí y no en el servicio porque ese fichero es `'use server'` y allí
 * todo export tiene que ser asíncrono: una función pura de cálculo se
 * convertiría, sin necesidad, en una acción invocable desde el navegador.
 *
 * Tiene UN solo sitio a propósito: la pantalla del canal compara esta misma
 * dirección contra la que Telegram dice tener registrada, para avisar de que
 * un bot quedó apuntando a un sitio muerto. Si hubiera dos copias y una
 * cambiara, ese aviso saltaría para todos los bots correctos y dejaría de
 * significar nada.
 */
export function buildTelegramWebhookUrl(avatarId: string): string {
    const base = process.env.NEXT_PUBLIC_APP_URL || APP_BASE_URL_FALLBACK
    return `${base}/api/webhooks/telegram/${avatarId}`
}

export interface SetWebhookParams {
    url: string
    /** Telegram lo devuelve en cada petición en `X-Telegram-Bot-Api-Secret-Token`. */
    secretToken?: string
    dropPendingUpdates?: boolean
}

export async function setWebhook(token: string, params: SetWebhookParams): Promise<boolean> {
    return callJson<boolean>(token, 'setWebhook', {
        url: params.url,
        secret_token: params.secretToken,
        drop_pending_updates: params.dropPendingUpdates,
        // Fijo a propósito: este plan sólo necesita mensajes y compras de
        // contenido de pago. El plan siguiente amplía esta lista.
        allowed_updates: ['message', 'purchased_paid_media'],
    })
}

export async function deleteWebhook(token: string, params?: { dropPendingUpdates?: boolean }): Promise<boolean> {
    return callJson<boolean>(token, 'deleteWebhook', {
        drop_pending_updates: params?.dropPendingUpdates,
    })
}

export async function getWebhookInfo(token: string): Promise<TelegramWebhookInfo> {
    return callJson<TelegramWebhookInfo>(token, 'getWebhookInfo')
}

export interface SendMessageParams {
    chat_id: number | string
    text: string
    parse_mode?: 'MarkdownV2' | 'HTML'
    protect_content?: boolean
}

export async function sendMessage(token: string, params: SendMessageParams): Promise<TgMessage> {
    return callJson<TgMessage>(token, 'sendMessage', { ...params })
}

export interface SendPaidMediaParams {
    chat_id: number | string
    /** 1-25000. */
    star_count: number
    /** 1-10 elementos. */
    media: InputPaidMedia[]
    /** Bytes para los `media[].media` que valen `attach://<nombre>`, indexados
     *  por ese mismo nombre — ver `MultipartFile` sobre el nombre de fichero
     *  de cada entrada. Si se omite, la llamada va por JSON puro (los
     *  `media[].media` deben ser entonces `file_id` o URLs http(s)). */
    files?: Record<string, MultipartFile>
    /** 0-128 bytes, NO se muestra al usuario — para correlacionar la venta. */
    payload?: string
    /** 0-1024 caracteres. */
    caption?: string
    protect_content?: boolean
}

/** Límites documentados de `sendPaidMedia`. Se comprueban ANTES de llamar a
 *  la red: un error de validación local es más claro que el 400 de Telegram,
 *  y no gasta una petición en un payload que ya se sabe inválido. */
function validateSendPaidMedia(params: SendPaidMediaParams): void {
    if (!Number.isInteger(params.star_count) || params.star_count < 1 || params.star_count > 25_000) {
        throw new RangeError(`star_count debe ser un entero entre 1 y 25000 (recibido: ${params.star_count})`)
    }
    if (params.media.length < 1 || params.media.length > 10) {
        throw new RangeError(`media debe tener entre 1 y 10 elementos (recibido: ${params.media.length})`)
    }
    if (params.payload !== undefined) {
        const bytes = new TextEncoder().encode(params.payload).length
        if (bytes > 128) {
            throw new RangeError(`payload no puede superar 128 bytes (recibido: ${bytes})`)
        }
    }
    if (params.caption !== undefined && params.caption.length > 1024) {
        throw new RangeError(`caption no puede superar 1024 caracteres (recibido: ${params.caption.length})`)
    }
    for (const item of params.media) {
        if (!item.media.startsWith('attach://')) continue
        const name = item.media.slice('attach://'.length)
        if (!params.files || !(name in params.files)) {
            throw new RangeError(`media referencia attach://${name} pero no está en "files"`)
        }
    }
}

export async function sendPaidMedia(token: string, params: SendPaidMediaParams): Promise<TgMessage> {
    validateSendPaidMedia(params)

    if (params.files && Object.keys(params.files).length > 0) {
        const fields: Record<string, string> = {
            chat_id: String(params.chat_id),
            star_count: String(params.star_count),
            media: JSON.stringify(params.media),
        }
        if (params.payload !== undefined) fields.payload = params.payload
        if (params.caption !== undefined) fields.caption = params.caption
        if (params.protect_content !== undefined) fields.protect_content = String(params.protect_content)
        return callMultipart<TgMessage>(token, 'sendPaidMedia', fields, params.files)
    }

    return callJson<TgMessage>(token, 'sendPaidMedia', {
        chat_id: params.chat_id,
        star_count: params.star_count,
        media: params.media,
        payload: params.payload,
        caption: params.caption,
        protect_content: params.protect_content,
    })
}

export async function getMyStarBalance(token: string): Promise<TelegramStarAmount> {
    return callJson<TelegramStarAmount>(token, 'getMyStarBalance')
}

export interface SendMediaParams {
    chat_id: number | string
    /** `file_id` reutilizable o `attach://<nombre>` (multipart) — a
     *  diferencia de `InputPaidMedia.media` esto NUNCA es una URL: el envío
     *  gratis siempre sale de un `file_id` cacheado o de bytes propios. */
    media: string
    /** 0-1024 caracteres. */
    caption?: string
    protect_content?: boolean
    /** Bytes para `media` cuando vale `attach://<nombre>` — ver
     *  `MultipartFile` sobre el nombre de fichero. Si se omite, la llamada va
     *  por JSON puro y `media` debe ser entonces un `file_id`. */
    files?: Record<string, MultipartFile>
}

/**
 * Límites documentados de `sendPhoto`/`sendVideo`
 * (https://core.telegram.org/bots/api#sendphoto,
 * https://core.telegram.org/bots/api#sendvideo) — comprobados ANTES de
 * llamar a la red, mismo criterio que `validateSendPaidMedia`. La subida por
 * multipart admite hasta 10 MB para fotos y 50 MB para el resto (vídeo
 * incluido); esta función NO mide bytes (`MultipartFile` es un `Blob` cuyo
 * tamaño real sólo lo conoce quien lo generó) — sólo valida forma: caption y
 * la coherencia de `attach://`.
 */
export function validateSendMedia(params: SendMediaParams): void {
    if (!params.media) {
        throw new RangeError('media no puede estar vacío')
    }
    if (params.caption !== undefined && params.caption.length > 1024) {
        throw new RangeError(`caption no puede superar 1024 caracteres (recibido: ${params.caption.length})`)
    }
    if (params.media.startsWith('attach://')) {
        const name = params.media.slice('attach://'.length)
        if (!params.files || !(name in params.files)) {
            throw new RangeError(`media referencia attach://${name} pero no está en "files"`)
        }
    }
}

/** Campos comunes a `sendPhoto`/`sendVideo` una vez validados — evita
 *  duplicar la rama multipart/JSON entre las dos funciones públicas. */
function buildSendMediaFields(params: SendMediaParams): Record<string, string> {
    const fields: Record<string, string> = { chat_id: String(params.chat_id) }
    if (params.caption !== undefined) fields.caption = params.caption
    if (params.protect_content !== undefined) fields.protect_content = String(params.protect_content)
    return fields
}

export async function sendPhoto(token: string, params: SendMediaParams): Promise<TgMessage> {
    validateSendMedia(params)

    if (params.files && Object.keys(params.files).length > 0) {
        const fields = { ...buildSendMediaFields(params), photo: params.media }
        return callMultipart<TgMessage>(token, 'sendPhoto', fields, params.files)
    }

    return callJson<TgMessage>(token, 'sendPhoto', {
        chat_id: params.chat_id,
        photo: params.media,
        caption: params.caption,
        protect_content: params.protect_content,
    })
}

export async function sendVideo(token: string, params: SendMediaParams): Promise<TgMessage> {
    validateSendMedia(params)

    if (params.files && Object.keys(params.files).length > 0) {
        const fields = { ...buildSendMediaFields(params), video: params.media }
        return callMultipart<TgMessage>(token, 'sendVideo', fields, params.files)
    }

    return callJson<TgMessage>(token, 'sendVideo', {
        chat_id: params.chat_id,
        video: params.media,
        caption: params.caption,
        protect_content: params.protect_content,
    })
}
