/**
 * Thin, typed HTTP client for the Fanvue AGENCY endpoints.
 *
 * Every request carries `X-Fanvue-API-Version` and a bearer access token. The
 * token is supplied by an injected provider (see `tokenStore.getValidAccessToken`)
 * so refresh/rotation stays out of this transport layer; on a 401 the client
 * asks the provider for a forced refresh and retries once.
 *
 * Verified endpoints (Fanvue API reference, version 2025-06-26):
 *  - GET   /creators                                                   list managed creators
 *  - POST  /creators/{uuid}/media/uploads                              create multipart session
 *  - GET   /creators/{uuid}/media/uploads/{uploadId}/parts/{n}/url     presigned part URL (text/plain)
 *  - PATCH /creators/{uuid}/media/uploads/{uploadId}                   complete multipart session
 *  - GET   /creators/{uuid}/media/{mediaUuid}                          poll media status
 *  - POST  /creators/{uuid}/posts                                      create post
 */
import { FANVUE_API_BASE, FANVUE_API_VERSION } from './oauth'
import type {
    CreatePostInput,
    CreateUploadSessionInput,
    FanvueCompleteUploadResponse,
    FanvueCreator,
    FanvueListChatsResponse,
    FanvueListCreatorsResponse,
    FanvueListMessagesResponse,
    FanvueMediaStatusResponse,
    FanvuePostResponse,
    FanvueUploadPart,
    FanvueUploadSession,
    SendChatMessageInput,
    SendChatMessageResponse,
} from './types'

/** Wire-level Fanvue error carrying the HTTP status + raw response body. */
export class FanvueApiError extends Error {
    status: number
    body: string
    constructor(status: number, body: string) {
        super(`Fanvue API error ${status}`)
        this.name = 'FanvueApiError'
        this.status = status
        this.body = body
    }
}

export type FanvueAccessTokenProvider = (opts?: {
    force?: boolean
}) => Promise<string>

export interface FanvueClientOptions {
    getAccessToken: FanvueAccessTokenProvider
    apiBase?: string
    apiVersion?: string
}

const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms))

export class FanvueClient {
    private readonly getAccessToken: FanvueAccessTokenProvider
    private readonly apiBase: string
    private readonly apiVersion: string

    constructor(options: FanvueClientOptions) {
        this.getAccessToken = options.getAccessToken
        this.apiBase = options.apiBase ?? FANVUE_API_BASE
        this.apiVersion = options.apiVersion ?? FANVUE_API_VERSION
    }

    private async fetchWithAuth(
        method: string,
        path: string,
        init?: { headers?: Record<string, string>; body?: string },
    ): Promise<Response> {
        const url = new URL(path, this.apiBase).toString()
        const doFetch = (token: string): Promise<Response> =>
            fetch(url, {
                method,
                headers: {
                    ...(init?.headers ?? {}),
                    'X-Fanvue-API-Version': this.apiVersion,
                    Authorization: `Bearer ${token}`,
                },
                body: init?.body,
            })

        let res = await doFetch(await this.getAccessToken())
        if (res.status === 401) {
            // Access token unexpectedly rejected — force a refresh and retry once.
            res = await doFetch(await this.getAccessToken({ force: true }))
        }
        return res
    }

    private async requestJson<T>(
        method: string,
        path: string,
        body?: unknown,
    ): Promise<T> {
        const res = await this.fetchWithAuth(
            method,
            path,
            body !== undefined
                ? {
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(body),
                  }
                : undefined,
        )
        const text = await res.text()
        if (!res.ok) throw new FanvueApiError(res.status, text)
        return (text ? JSON.parse(text) : undefined) as T
    }

    /** `GET /creators` — one page of managed creators. */
    async listCreators(params?: {
        page?: number
        size?: number
    }): Promise<FanvueListCreatorsResponse> {
        const qs = new URLSearchParams()
        if (params?.page) qs.set('page', String(params.page))
        if (params?.size) qs.set('size', String(params.size))
        const query = qs.toString()
        return this.requestJson<FanvueListCreatorsResponse>(
            'GET',
            `/creators${query ? `?${query}` : ''}`,
        )
    }

    /** Walk `GET /creators` pagination (bounded) and return every managed creator. */
    async listAllCreators(): Promise<FanvueCreator[]> {
        const all: FanvueCreator[] = []
        let page = 1
        // Hard cap to guard against a misbehaving `hasMore`.
        for (let i = 0; i < 50; i++) {
            const res = await this.listCreators({ page, size: 50 })
            all.push(...res.data)
            if (!res.pagination?.hasMore) break
            page += 1
        }
        return all
    }

    /**
     * Path prefix for media/post endpoints. Agency mode targets a managed
     * creator (`/creators/{uuid}`); self mode (a solo creator account) targets
     * the authenticated user with no prefix. Pass `null` for self.
     */
    private base(creatorUuid: string | null): string {
        return creatorUuid
            ? `/creators/${encodeURIComponent(creatorUuid)}`
            : ''
    }

    /** `POST [/creators/{uuid}]/media/uploads`. */
    async createUploadSession(
        creatorUuid: string | null,
        input: CreateUploadSessionInput,
    ): Promise<FanvueUploadSession> {
        return this.requestJson<FanvueUploadSession>(
            'POST',
            `${this.base(creatorUuid)}/media/uploads`,
            input,
        )
    }

    /**
     * `GET /creators/{uuid}/media/uploads/{uploadId}/parts/{n}/url` — the S3
     * presigned URL is returned as `text/plain`, not JSON.
     */
    async getPartSignedUrl(
        creatorUuid: string | null,
        uploadId: string,
        partNumber: number,
    ): Promise<string> {
        const res = await this.fetchWithAuth(
            'GET',
            `${this.base(creatorUuid)}/media/uploads/${encodeURIComponent(
                uploadId,
            )}/parts/${partNumber}/url`,
        )
        const text = await res.text()
        if (!res.ok) throw new FanvueApiError(res.status, text)
        return text.trim()
    }

    /** `PATCH /creators/{uuid}/media/uploads/{uploadId}`. */
    async completeUpload(
        creatorUuid: string | null,
        uploadId: string,
        parts: FanvueUploadPart[],
    ): Promise<FanvueCompleteUploadResponse> {
        return this.requestJson<FanvueCompleteUploadResponse>(
            'PATCH',
            `${this.base(creatorUuid)}/media/uploads/${encodeURIComponent(uploadId)}`,
            { parts },
        )
    }

    /** `GET /creators/{uuid}/media/{mediaUuid}` — status is returned for non-ready media too. */
    async getMediaStatus(
        creatorUuid: string | null,
        mediaUuid: string,
    ): Promise<FanvueMediaStatusResponse> {
        return this.requestJson<FanvueMediaStatusResponse>(
            'GET',
            `${this.base(creatorUuid)}/media/${encodeURIComponent(mediaUuid)}`,
        )
    }

    /**
     * Poll media status until it is usable in a post. Bounded retries with a
     * capped linear backoff. Throws on an `error` status or on timeout.
     */
    async waitUntilMediaReady(
        creatorUuid: string | null,
        mediaUuid: string,
        opts?: { attempts?: number; intervalMs?: number },
    ): Promise<FanvueMediaStatusResponse> {
        const attempts = opts?.attempts ?? 20
        const baseInterval = opts?.intervalMs ?? 1500
        let last: FanvueMediaStatusResponse | undefined
        for (let i = 0; i < attempts; i++) {
            last = await this.getMediaStatus(creatorUuid, mediaUuid)
            const status = String(last.status).toLowerCase()
            // The OpenAPI enum is created|processing|ready|error; the docs prose
            // also mentions "FINALISED" — accept both spellings defensively.
            if (
                status === 'ready' ||
                status === 'finalised' ||
                status === 'finalized'
            )
                return last
            if (status === 'error' || status === 'failed') {
                throw new Error(
                    `Fanvue media processing failed (status: ${last.status})`,
                )
            }
            await sleep(Math.min(baseInterval * (i + 1), 8000))
        }
        throw new Error(
            `Fanvue media not ready after ${attempts} attempts (last status: ${last?.status ?? 'unknown'})`,
        )
    }

    /** `POST [/creators/{uuid}]/posts`. */
    async createCreatorPost(
        creatorUuid: string | null,
        body: CreatePostInput,
    ): Promise<FanvuePostResponse> {
        return this.requestJson<FanvuePostResponse>(
            'POST',
            `${this.base(creatorUuid)}/posts`,
            body,
        )
    }

    // -----------------------------------------------------------------------
    // Chats (agent inbox). Shapes verified against api.fanvue.com docs
    // 2026-07-11. Chats are keyed by the FAN's userUuid.
    // -----------------------------------------------------------------------

    /** `GET [/creators/{uuid}]/chats` — one page of chat summaries. */
    async listChats(
        creatorUuid: string | null,
        params?: { page?: number; size?: number },
    ): Promise<FanvueListChatsResponse> {
        const qs = new URLSearchParams()
        if (params?.page) qs.set('page', String(params.page))
        if (params?.size) qs.set('size', String(params.size))
        const query = qs.toString()
        return this.requestJson<FanvueListChatsResponse>(
            'GET',
            `${this.base(creatorUuid)}/chats${query ? `?${query}` : ''}`,
        )
    }

    /**
     * `GET [/creators/{uuid}]/chats/{userUuid}/messages`. `markAsRead`
     * defaults to FALSE here (the API defaults to true) so agent syncs never
     * silently clear the human's unread state.
     */
    async listChatMessages(
        creatorUuid: string | null,
        userUuid: string,
        params?: { page?: number; size?: number; markAsRead?: boolean },
    ): Promise<FanvueListMessagesResponse> {
        const qs = new URLSearchParams()
        if (params?.page) qs.set('page', String(params.page))
        if (params?.size) qs.set('size', String(params.size))
        qs.set('markAsRead', String(params?.markAsRead ?? false))
        return this.requestJson<FanvueListMessagesResponse>(
            'GET',
            `${this.base(creatorUuid)}/chats/${encodeURIComponent(userUuid)}/messages?${qs.toString()}`,
        )
    }

    /** `POST [/creators/{uuid}]/chats/{userUuid}/message` (singular per docs) → 201. */
    async sendChatMessage(
        creatorUuid: string | null,
        userUuid: string,
        input: SendChatMessageInput,
    ): Promise<SendChatMessageResponse> {
        return this.requestJson<SendChatMessageResponse>(
            'POST',
            `${this.base(creatorUuid)}/chats/${encodeURIComponent(userUuid)}/message`,
            input,
        )
    }
}
