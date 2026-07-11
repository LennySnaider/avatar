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
