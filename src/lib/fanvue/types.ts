/**
 * Fanvue API domain types.
 *
 * Verified against the Fanvue API reference (base https://api.fanvue.com,
 * version header `X-Fanvue-API-Version: 2025-06-26`). See the per-endpoint
 * doc URLs referenced in `FanvueClient.ts`.
 */

/** Media kinds accepted by the multipart upload session. */
export type FanvueMediaType = 'image' | 'video' | 'audio' | 'document'

/** Media/upload-session lifecycle status (create-upload + get-media responses). */
export type FanvueMediaStatus = 'created' | 'processing' | 'ready' | 'error'

/** Who a post is visible to. `audience` is REQUIRED on create-post. */
export type FanvuePostAudience = 'subscribers' | 'followers-and-subscribers'

/** Normalised, app-side token bundle. `expiresAt` is an absolute ISO 8601 time. */
export interface FanvueTokens {
    accessToken: string
    refreshToken: string
    expiresAt: string
    scopes: string[]
}

/** Raw OAuth 2.0 token endpoint response (RFC 6749 shape). */
export interface FanvueTokenResponse {
    access_token: string
    refresh_token: string
    expires_in: number
    scope?: string
    token_type?: string
}

/** A managed creator as returned by `GET /creators`. */
export interface FanvueCreator {
    uuid: string
    handle: string
    displayName: string
    nickname: string | null
    isTopSpender?: boolean
    avatarUrl: string | null
    registeredAt?: string
    role?: string
}

export interface FanvuePagination {
    page: number
    size: number
    hasMore: boolean
}

export interface FanvueListCreatorsResponse {
    data: FanvueCreator[]
    pagination: FanvuePagination
}

/** Body for `POST /creators/{uuid}/media/uploads`. */
export interface CreateUploadSessionInput {
    name: string
    filename: string
    mediaType: FanvueMediaType
    sizeBytes?: number
}

/** Response of the create-upload-session call. `mediaUuid` is returned HERE. */
export interface FanvueUploadSession {
    mediaUuid: string
    uploadId: string
    partSize: number
    maxParts: number
    totalParts: number | null
}

/** One completed S3 part (casing matches the Fanvue complete-upload body). */
export interface FanvueUploadPart {
    PartNumber: number
    ETag: string
}

export interface FanvueCompleteUploadResponse {
    status: FanvueMediaStatus
}

export interface FanvueMediaStatusResponse {
    uuid: string
    status: FanvueMediaStatus
}

/** Body for `POST /creators/{uuid}/posts`. `price` is integer cents (min 300). */
export interface CreatePostInput {
    audience: FanvuePostAudience
    text?: string
    mediaUuids?: string[]
    mediaPreviewUuid?: string
    price?: number
    publishAt?: string
    expiresAt?: string
    collectionUuids?: string[]
}

/**
 * Body for `PATCH [/creators/{uuid}]/posts/{postUuid}`. Every field optional —
 * only the keys present are changed (verified against the update-post reference,
 * 2026-07-24). `null` clears a value (e.g. `price: null` makes a post free).
 */
export interface UpdatePostInput {
    text?: string | null
    audience?: FanvuePostAudience
    price?: number | null
    publishAt?: string | null
    expiresAt?: string | null
    mediaUuids?: string[]
    mediaPreviewUuid?: string | null
    collectionUuids?: string[] | null
}

/** Response of the create-post call (201). */
export interface FanvuePostResponse {
    uuid: string
    createdAt: string
    text: string | null
    price: number | null
    mediaPreviewUuid: string | null
    audience: FanvuePostAudience
    publishAt: string | null
    publishedAt: string | null
    expiresAt: string | null
}

// ---------------------------------------------------------------------------
// Chats & messages (shapes read from api.fanvue.com docs 2026-07-11:
// get-list-of-chats.md / get-messages-from-a-chat.md / send-a-message.md)
// ---------------------------------------------------------------------------

export interface FanvueChatUser {
    uuid: string
    handle: string
    displayName: string
    nickname?: string | null
    isTopSpender?: boolean
    avatarUrl?: string | null
    registeredAt?: string
}

export interface FanvueChatLastMessage {
    uuid: string
    text: string | null
    type?: string
    sentAt: string | null
    hasMedia?: boolean | null
    mediaType?: string | null
    senderUuid: string
    sentByUserId?: string | null
    status?: string | null
}

export interface FanvueChatSummary {
    createdAt: string | null
    lastMessageAt: string | null
    isRead: boolean
    isMuted?: boolean
    unreadMessagesCount: number
    user: FanvueChatUser
    lastMessage: FanvueChatLastMessage | null
    isCreator?: boolean
    online?: boolean
    lastSeenAt?: string | null
}

export interface FanvueListChatsResponse {
    data: FanvueChatSummary[]
    pagination: FanvuePagination
}

export interface FanvueMessageParty {
    uuid: string
    handle: string
}

export interface FanvueMessage {
    uuid: string
    text: string | null
    sentAt: string
    sender: FanvueMessageParty
    recipient: FanvueMessageParty
    hasMedia?: boolean | null
    mediaType?: 'image' | 'video' | 'audio' | 'document' | null
    mediaUuids?: string[]
    type?: string
    sentByUserId?: string | null
    isRead?: boolean
}

export interface FanvueListMessagesResponse {
    data: FanvueMessage[]
    pagination: FanvuePagination
}

/** Body of `POST /chats/{userUuid}/message` (path is SINGULAR per docs). */
export interface SendChatMessageInput {
    text?: string | null
    mediaUuids?: string[]
    mediaPreviewUuid?: string | null
    price?: number | null
}

export interface SendChatMessageResponse {
    messageUuid: string
}

// ---------------------------------------------------------------------------
// Insights de agencia (dashboards de ingresos). Verificado contra
// https://api.fanvue.com/docs/v1/api-reference/list-per-creator-per-day-earnings-across-all-agency-creators-cursor-paginated.md
// el 2026-09-17: `GET /v1/agencies/earnings`, scopes read:agency +
// read:creator, importes en CENTAVOS de USD, un registro por creator y día
// (UTC), sólo facturas pagadas (sin desglose por tipo ni reversos).
// ---------------------------------------------------------------------------

export interface FanvueAgencyEarningsRow {
    creatorUuid: string
    /** 'YYYY-MM-DD' (día UTC). */
    date: string
    /** Lo que pagó el fan, en centavos de USD. */
    gross: number
    /** Lo que se lleva el creator tras la comisión de Fanvue, en centavos. */
    net: number
    currency: string
}

/**
 * Forma REAL comprobada contra la API el 2026-09-19. Este endpoint NO usa
 * cursores: pagina por `page` y avisa con `hasMore`. Antes se declaraba con
 * `nextCursor`, que nunca llega — y leer un campo inexistente hacía que el
 * recorrido cortase en la primera página creyéndose completo.
 */
export interface FanvueAgencyEarningsResponse {
    data: FanvueAgencyEarningsRow[]
    pagination: {
        page: number
        size: number
        hasMore: boolean
    }
}

export interface ListAgencyEarningsParams {
    /** ISO 8601 con zona, inclusive (p.ej. '2026-09-01T00:00:00.000Z'). */
    startDate: string
    /** ISO 8601 con zona, EXCLUSIVO. */
    endDate: string
    /** Máximo 50 por llamada (lo impone Fanvue). */
    creatorUuids?: string[]
    /** 1-based. Este endpoint pagina por número de página, no por cursor. */
    page?: number
    /** 1..50, por defecto 15 en Fanvue. */
    size?: number
}
