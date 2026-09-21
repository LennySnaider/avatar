/**
 * UploadPostProvider — REST implementation over Upload-Post API.
 *
 * Base URL defaults to https://api.upload-post.com. Auth header is
 *   Authorization: Apikey <key>
 *
 * All wire-level failures surface as UploadPostProviderError with statusCode
 * and body. Consumers should catch and map them to UI / audit events.
 *
 * @see docs/superpowers/specs/2026-04-20-social-media-scheduling-design.md
 */

import crypto from 'crypto'
import type {
  AnalyticsSnapshot,
  ConnectedAccount,
  CreateCommentResult,
  InstagramDmButton,
  Platform,
  PrivateReplyResult,
  QueueSettings,
  SocialCommentsPage,
  UploadPostHistoryEntry,
} from '@/@types/social'
import {
  normalizeCommentsPage,
  normalizeHistoryEntry,
  isReauthRequiredBody,
} from '@/lib/social/comments/normalize'
import type {
  AccountProfiles,
  DocumentPostParams,
  FFmpegConsumption,
  FFmpegJobParams,
  FFmpegJobStatus,
  GenerateConnectUrlParams,
  GenerateConnectUrlResult,
  HistoryEntry,
  PhotoPostParams,
  PlatformPage,
  ProfileDetails,
  PublishResponse,
  QueueSlotPreview,
  RateLimitInfo,
  RequestStatus,
  ScheduledPost,
  SocialProvider,
  TextPostParams,
  VideoPostParams,
  WebhookConfigResult,
} from './SocialProvider'

// El armado del multipart vive aparte para poder testearlo sin red: ahí está
// documentado por qué `audio_name` NO puede viajar prefijado.
import { buildPublishForm, buildVideoUploadForm } from './uploadPostForm'

// `RateLimitInfo` vive en `SocialProvider.ts` (F4.2 Tarea 5): la interfaz
// declara `getLastRateLimit()` y este archivo re-exporta el tipo por
// compatibilidad con quien ya lo importaba desde aquí.
export type { RateLimitInfo } from './SocialProvider'

const DEFAULT_BASE_URL = 'https://api.upload-post.com'

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class UploadPostProviderError extends Error {
  readonly name: string = 'UploadPostProviderError'
  readonly statusCode: number
  readonly body: unknown

  constructor(message: string, statusCode: number, body: unknown) {
    super(message)
    this.statusCode = statusCode
    this.body = body
    // Restore prototype chain (ES5 transpile safety)
    Object.setPrototypeOf(this, UploadPostProviderError.prototype)
  }

  /**
   * true cuando este error significa "hay que reconectar la cuenta social"
   * en vez de un fallo cualquiera — medido en vivo (2026-09-16) contra
   * Instagram con la sesión vencida: 401 + `code: "instagram_reauth_required"`.
   * Delega en isReauthRequiredBody (normalize.ts) para poder testear la
   * detección sin construir un UploadPostProviderError.
   */
  get isReauthRequired(): boolean {
    return isReauthRequiredBody(this.statusCode, this.body)
  }

  /**
   * true cuando la cuenta agencia está llena: `POST /api/uploadposts/users`
   * responde 403 con `error_code: "PROFILE_LIMIT_REACHED"` (doc de User
   * Profiles). Un 403 por otro motivo NO es esto.
   */
  get isProfileLimitReached(): boolean {
    return this.statusCode === 403 && isProfileLimitBody(this.body)
  }
}

function isProfileLimitBody(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false
  return (body as Record<string, unknown>).error_code === 'PROFILE_LIMIT_REACHED'
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class UploadPostProvider implements SocialProvider {
  private readonly apiKey: string
  private readonly baseUrl: string
  // Último `x-ratelimit-*` visto en CUALQUIER respuesta (no solo comentarios)
  // — el poll de comentarios lo usa para frenar cuando remaining < 5.
  private lastRateLimit: RateLimitInfo | null = null

  constructor(apiKey: string, baseUrl: string = DEFAULT_BASE_URL) {
    this.apiKey = apiKey
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  /** Snapshot de rate-limit de la última respuesta HTTP, o null si aún no se hizo ninguna. */
  getLastRateLimit(): RateLimitInfo | null {
    return this.lastRateLimit
  }

  // -------------------------------------------------------------------------
  // Low-level HTTP helpers
  // -------------------------------------------------------------------------

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Apikey ${this.apiKey}`,
    }
  }

  private buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
    const url = `${this.baseUrl}${path}`
    if (!query) return url
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue
      params.set(key, String(value))
    }
    const qs = params.toString()
    return qs ? `${url}?${qs}` : url
  }

  private async request<T>(
    path: string,
    init: {
      method?: string
      /**
       * JSON body. Mutually exclusive with `formData`. Sets
       * Content-Type: application/json.
       */
      body?: unknown
      /**
       * multipart/form-data body. Required by Upload-Post for /upload,
       * /upload_photos, /upload_text and /upload_document. Browser/Node
       * fetch sets the Content-Type header automatically (with boundary)
       * when body is a FormData instance, so we drop our default header
       * to avoid clobbering it.
       */
      formData?: FormData
      query?: Record<string, string | number | undefined>
    } = {},
  ): Promise<T> {
    const method = init.method ?? 'GET'
    const url = this.buildUrl(path, init.query)

    let headers: Record<string, string>
    let body: BodyInit | undefined
    if (init.formData) {
      // Strip Content-Type so fetch can set the multipart boundary.
      headers = { Authorization: `Apikey ${this.apiKey}` }
      body = init.formData
    } else {
      headers = this.headers()
      body = init.body !== undefined ? JSON.stringify(init.body) : undefined
    }

    const res = await fetch(url, { method, headers, body })

    // Rate-limit headers vienen en TODAS las respuestas (confirmado en vivo
    // 2026-09-16), no solo en las de comentarios — se capturan siempre para
    // que el poll pueda frenar cuando remaining < 5.
    const rlLimit = res.headers.get('x-ratelimit-limit')
    const rlRemaining = res.headers.get('x-ratelimit-remaining')
    const rlReset = res.headers.get('x-ratelimit-reset')
    if (rlLimit !== null || rlRemaining !== null || rlReset !== null) {
      this.lastRateLimit = {
        limit: rlLimit !== null ? Number(rlLimit) : null,
        remaining: rlRemaining !== null ? Number(rlRemaining) : null,
        reset: rlReset !== null ? Number(rlReset) : null,
      }
    }

    const text = await res.text()
    let parsed: unknown = null
    if (text) {
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = text
      }
    }

    if (!res.ok) {
      // Log del cuerpo CRUDO: el mensaje que ve el usuario esta resumido, y
      // cuando el proveedor cambia el formato del error esto es lo unico que
      // permite saber que dijo de verdad.
      console.warn(
        `[upload-post] ${method} ${path} -> ${res.status}`,
        typeof parsed === 'string' ? parsed.slice(0, 500) : parsed,
      )
      throw new UploadPostProviderError(
        this.mapErrorMessage(res.status, parsed),
        res.status,
        parsed,
      )
    }

    return parsed as T
  }

  private mapErrorMessage(status: number, body: unknown): string {
    // El motivo REAL viene en el cuerpo, y solo se leia `body.error` de un
    // objeto JSON: un 429 con cuerpo de TEXTO PLANO —o con la clave `message`/
    // `detail`— se perdia entero y el usuario veia "Upload-Post API error
    // (429)", que no dice si es cuota agotada, limite por minuto o que.
    const apiError = ((): string | null => {
      if (typeof body === 'string') return body.trim() || null
      if (body && typeof body === 'object') {
        for (const k of ['error', 'message', 'detail', 'msg'] as const) {
          const v = (body as Record<string, unknown>)[k]
          if (typeof v === 'string' && v.trim()) return v.trim()
        }
      }
      return null
    })()

    switch (status) {
      case 401:
        return 'Invalid Upload-Post API key — check the key for this account.'
      case 403:
        // Sólo es "cuenta llena" cuando Upload-Post lo dice con su código;
        // cualquier otro 403 se relata tal cual para no mandar a nadie a
        // subir de plan por un permiso denegado.
        return isProfileLimitBody(body)
          ? 'Upload-Post profile limit reached — the agency account is full; free a profile or upgrade the plan.'
          : apiError
            ? `Upload-Post refused the request (403): ${apiError}`
            : 'Upload-Post refused the request (403).'
      case 404:
        return 'Resource not found'
      case 429:
        // 429 al publicar = limite de Upload-Post, no un fallo nuestro:
        // o el cupo del plan se agoto, o se esta publicando demasiado
        // seguido. Se dice, para no perseguir un bug que no existe.
        return apiError
          ? `Upload-Post rejected the post (429): ${apiError}`
          : 'Upload-Post rate limit (429) — either the plan\'s upload quota is used up or posts are going out too fast. Check your Upload-Post plan usage and retry in a few minutes.'
      default:
        return apiError
          ? `Upload-Post error (${status}): ${apiError}`
          : `Upload-Post API error (${status})`
    }
  }

  // -------------------------------------------------------------------------
  // Profiles
  // -------------------------------------------------------------------------

  async createProfile(username: string): Promise<{ username: string }> {
    const res = await this.request<{ username: string }>(
      '/api/uploadposts/users',
      { method: 'POST', body: { username } },
    )
    return { username: res.username ?? username }
  }

  /**
   * Todos los perfiles de la cuenta (agencia) más `plan`/`limit` — antes se
   * descartaban y la UI no podía decir "N / 25 perfiles".
   */
  async listProfiles(): Promise<AccountProfiles> {
    const res = await this.request<{
      profiles?: unknown[]
      users?: unknown[]
      plan?: unknown
      limit?: unknown
    }>('/api/uploadposts/users')
    // The real endpoint returns `profiles`. Older docs/mocks returned `users`
    // — accept both for forward-compat.
    const list = Array.isArray(res?.profiles)
      ? res.profiles
      : Array.isArray(res?.users)
        ? res.users
        : []
    return {
      plan: typeof res?.plan === 'string' ? res.plan : null,
      limit: typeof res?.limit === 'number' ? res.limit : null,
      profiles: list.map((raw) => this.toProfileDetails(raw)),
    }
  }

  async getProfile(username: string): Promise<ProfileDetails> {
    const res = await this.request<unknown>(
      `/api/uploadposts/users/${encodeURIComponent(username)}`,
    )
    return this.toProfileDetails(res)
  }

  async deleteProfile(username: string): Promise<void> {
    await this.request<void>('/api/uploadposts/users', {
      method: 'DELETE',
      body: { username },
    })
  }

  /**
   * Parse a profile blob. Upload-Post returns two shapes:
   *
   *   GET /uploadposts/users → { profiles: [<profile>, ...] }
   *   GET /uploadposts/users/{username} → { success, profile: <profile> }
   *
   * Inside `<profile>`:
   *   - `username`, `created_at`, `platforms` (top-level)
   *   - `social_accounts` is an OBJECT keyed by platform name (not an array).
   *     Empty/disconnected platforms appear as `""`. Connected platforms have
   *     a record like `{ username, handle, display_name, social_images,
   *     reauth_required }`.
   */
  private toProfileDetails(raw: unknown): ProfileDetails {
    let obj = (raw ?? {}) as Record<string, unknown>
    // Unwrap `{ profile: {...} }` envelope from /users/{username} endpoint.
    if (obj.profile && typeof obj.profile === 'object') {
      obj = obj.profile as Record<string, unknown>
    }
    const username = String(obj.username ?? '')
    const createdAt = String(obj.created_at ?? '')

    const connectedAccounts: ConnectedAccount[] = []
    const socialRaw = obj.social_accounts
    if (socialRaw && typeof socialRaw === 'object' && !Array.isArray(socialRaw)) {
      // Object keyed by platform → enumerate keys, skip empty values.
      for (const [platform, value] of Object.entries(
        socialRaw as Record<string, unknown>,
      )) {
        if (!value || typeof value !== 'object') continue
        const a = value as Record<string, unknown>
        connectedAccounts.push({
          platform: platform as Platform,
          accountName: String(a.display_name ?? a.handle ?? a.account_name ?? ''),
          accountId: String(a.username ?? a.account_id ?? a.accountId ?? ''),
          connectedAt: String(a.connected_at ?? a.connectedAt ?? createdAt),
          avatarUrl:
            a.social_images || a.avatar_url || a.avatarUrl
              ? String(a.social_images ?? a.avatar_url ?? a.avatarUrl)
              : undefined,
          followersCount:
            typeof a.followers_count === 'number'
              ? a.followers_count
              : typeof a.followersCount === 'number'
                ? a.followersCount
                : undefined,
          // Sólo cuando es true: así el snapshot jsonb no crece con un
          // `false` por cuenta y la UI pinta el aviso de "re-auth".
          reauthRequired: a.reauth_required === true ? true : undefined,
        })
      }
    } else if (Array.isArray(socialRaw)) {
      // Legacy array shape (kept for forward-compat).
      for (const acc of socialRaw) {
        const a = (acc ?? {}) as Record<string, unknown>
        const platform = String(a.platform ?? '')
        if (!platform) continue
        connectedAccounts.push({
          platform: platform as Platform,
          accountName: String(a.account_name ?? a.accountName ?? a.display_name ?? ''),
          accountId: String(a.account_id ?? a.accountId ?? a.username ?? ''),
          connectedAt: String(a.connected_at ?? a.connectedAt ?? createdAt),
          avatarUrl:
            a.avatar_url || a.avatarUrl || a.social_images
              ? String(a.avatar_url ?? a.avatarUrl ?? a.social_images)
              : undefined,
          followersCount:
            typeof a.followers_count === 'number'
              ? a.followers_count
              : typeof a.followersCount === 'number'
                ? a.followersCount
                : undefined,
        })
      }
    }

    return {
      username,
      connectedAccounts,
      metadata:
        obj.metadata && typeof obj.metadata === 'object'
          ? (obj.metadata as Record<string, unknown>)
          : undefined,
    }
  }

  // -------------------------------------------------------------------------
  // Connect flow (JWT)
  // -------------------------------------------------------------------------

  async generateConnectUrl(
    params: GenerateConnectUrlParams,
  ): Promise<GenerateConnectUrlResult> {
    const body: Record<string, unknown> = {
      username: params.username,
      redirect_url: params.redirectUrl,
    }
    if (params.logoUrl) body.logo_image = params.logoUrl
    if (params.platforms) body.platforms = params.platforms
    if (params.showCalendar !== undefined) body.show_calendar = params.showCalendar
    if (params.readonlyCalendar !== undefined)
      body.readonly_calendar = params.readonlyCalendar
    if (params.connectTitle) body.connect_title = params.connectTitle
    if (params.connectDescription)
      body.connect_description = params.connectDescription
    if (params.redirectButtonText)
      body.redirect_button_text = params.redirectButtonText

    const res = await this.request<{ access_url: string; accessUrl?: string }>(
      '/api/uploadposts/users/generate-jwt',
      { method: 'POST', body },
    )

    const accessUrl = String(res.access_url ?? res.accessUrl ?? '')
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000) // 48h TTL
    return { accessUrl, expiresAt }
  }

  async validateJwt(
    token: string,
  ): Promise<{ valid: boolean; username?: string }> {
    const res = await this.request<{ valid?: boolean; username?: string }>(
      '/api/uploadposts/users/validate-jwt',
      { method: 'POST', body: { token } },
    )
    return { valid: Boolean(res?.valid), username: res?.username }
  }

  // -------------------------------------------------------------------------
  // Publishing
  // -------------------------------------------------------------------------

  async publishVideo(params: VideoPostParams): Promise<PublishResponse> {
    const fd = buildVideoUploadForm(params)
    const res = await this.request<{ request_id: string; total_platforms: number }>(
      '/api/upload',
      { method: 'POST', formData: fd },
    )
    return this.toPublishResponse(res)
  }

  async publishPhoto(params: PhotoPostParams): Promise<PublishResponse> {
    const fd = buildPublishForm(params)
    for (const url of params.photoUrls) {
      fd.append('photos[]', url)
    }
    const res = await this.request<{ request_id: string; total_platforms: number }>(
      '/api/upload_photos',
      { method: 'POST', formData: fd },
    )
    return this.toPublishResponse(res)
  }

  async publishText(params: TextPostParams): Promise<PublishResponse> {
    const fd = buildPublishForm(params)
    const res = await this.request<{ request_id: string; total_platforms: number }>(
      '/api/upload_text',
      { method: 'POST', formData: fd },
    )
    return this.toPublishResponse(res)
  }

  async publishDocument(params: DocumentPostParams): Promise<PublishResponse> {
    const fd = buildPublishForm(params)
    fd.append('document', params.documentUrl)
    if (params.documentTitle) fd.append('document_title', params.documentTitle)
    const res = await this.request<{ request_id: string; total_platforms: number }>(
      '/api/upload_document',
      { method: 'POST', formData: fd },
    )
    return this.toPublishResponse(res)
  }

  private toPublishResponse(res: {
    request_id?: string
    total_platforms?: number
  }): PublishResponse {
    return {
      requestId: String(res?.request_id ?? ''),
      totalPlatforms: Number(res?.total_platforms ?? 0),
    }
  }

  // -------------------------------------------------------------------------
  // Status / history
  // -------------------------------------------------------------------------

  async getRequestStatus(requestId: string): Promise<RequestStatus> {
    const res = await this.request<{
      status: string
      data?: Record<string, unknown>
    }>('/api/uploadposts/status', { query: { request_id: requestId } })
    return { status: String(res?.status ?? 'unknown'), data: res?.data }
  }

  async getHistory(username: string, limit: number = 20): Promise<HistoryEntry[]> {
    const res = await this.request<{ history?: unknown[] }>(
      '/api/uploadposts/history',
      { query: { username, limit } },
    )
    const list = Array.isArray(res?.history) ? res.history : []
    return list.map((raw) => {
      const r = (raw ?? {}) as Record<string, unknown>
      return {
        id: String(r.id ?? r.request_id ?? ''),
        status: String(r.status ?? 'unknown'),
        createdAt: String(r.created_at ?? r.createdAt ?? ''),
      }
    })
  }

  /**
   * Historial por profile_username, verificado en vivo hoy (2026-09-16)
   * contra la key de Emily. `getHistory` de arriba manda `username` — la
   * doc real no reconoce ese parámetro (lo ignora silenciosamente, no
   * tira error, simplemente no filtra) — este método manda el nombre
   * correcto: `profile_username`. `limit` SOLO acepta 10/20/50/100
   * (`limit=4` devuelve 400 `{"error":"Invalid limit"}`), por eso el
   * default acá es 50 en vez de 20.
   */
  async listHistory(input: {
    profileUsername: string
    requestId?: string
    jobId?: string
    platform?: string
    limit?: 10 | 20 | 50 | 100
  }): Promise<UploadPostHistoryEntry[]> {
    const res = await this.request<{ history?: unknown[] }>(
      '/api/uploadposts/history',
      {
        query: {
          profile_username: input.profileUsername,
          request_id: input.requestId,
          job_id: input.jobId,
          platform: input.platform,
          limit: input.limit ?? 50,
        },
      },
    )
    const list = Array.isArray(res?.history) ? res.history : []
    return list.map((raw) => normalizeHistoryEntry(raw))
  }

  // -------------------------------------------------------------------------
  // Comentarios / respuestas
  // -------------------------------------------------------------------------

  /**
   * GET /api/uploadposts/comments — verificado en vivo hoy (2026-09-16):
   * `limit` solo acepta 10/20/50/100 según la doc de historial, pero acá NO
   * se le fuerza un default porque la doc de comments no documenta el mismo
   * límite duro; se manda tal cual lo pida el caller. Para X (Twitter) una
   * página puede venir vacía con `has_next: true` — normalizeCommentsPage
   * lo devuelve tal cual, no es un error.
   */
  async listComments(input: {
    username: string
    platform: Platform
    postId?: string
    postUrl?: string
    limit?: number
    after?: string
    commentId?: string
  }): Promise<SocialCommentsPage> {
    const res = await this.request<Record<string, unknown>>(
      '/api/uploadposts/comments',
      {
        query: {
          platform: input.platform,
          user: input.username,
          post_id: input.postId,
          post_url: input.postUrl,
          limit: input.limit,
          after: input.after,
          comment_id: input.commentId,
        },
      },
    )
    return normalizeCommentsPage(input.platform, res)
  }

  /**
   * POST /api/uploadposts/comments/create — crea un comentario público o
   * responde a uno existente (pasando `commentId`). La respuesta estándar
   * trae `id`; TikTok devuelve en cambio
   * `{ success, platform:'tiktok', result:{ comment_id } }` (confirmado en
   * la doc https://docs.upload-post.com/api/comments.md) — se leen ambas
   * formas.
   */
  async createComment(input: {
    username: string
    platform: Platform
    message: string
    commentId?: string
    postId?: string
    postUrl?: string
  }): Promise<CreateCommentResult> {
    const res = await this.request<{
      success?: boolean
      id?: string
      result?: { comment_id?: string }
    }>('/api/uploadposts/comments/create', {
      method: 'POST',
      body: {
        platform: input.platform,
        user: input.username,
        message: input.message,
        comment_id: input.commentId,
        post_id: input.postId,
        post_url: input.postUrl,
      },
    })
    const id = res?.id ?? res?.result?.comment_id ?? ''
    return { id: String(id) }
  }

  /**
   * POST /api/uploadposts/comments/reply — DM privado de Instagram en
   * respuesta a un comentario público (distinto de createComment: ese deja
   * un comentario público, este manda un mensaje directo). Doc:
   * https://docs.upload-post.com/api/instagram-comments.md
   */
  async sendInstagramPrivateReply(input: {
    username: string
    commentId: string
    message: string
    buttons?: InstagramDmButton[]
  }): Promise<PrivateReplyResult> {
    const body: Record<string, unknown> = {
      platform: 'instagram',
      user: input.username,
      comment_id: input.commentId,
      message: input.message,
    }
    if (input.buttons?.length) {
      body.buttons = input.buttons.map((b) => ({ title: b.title, url: b.url }))
    }
    const res = await this.request<{
      success?: boolean
      recipient_id?: string
      message_id?: string
    }>('/api/uploadposts/comments/reply', { method: 'POST', body })
    return {
      messageId: String(res?.message_id ?? ''),
      recipientId: res?.recipient_id ? String(res.recipient_id) : null,
    }
  }

  // -------------------------------------------------------------------------
  // Scheduling
  // -------------------------------------------------------------------------

  async listScheduled(username: string): Promise<ScheduledPost[]> {
    const res = await this.request<{ scheduled?: unknown[] }>(
      '/api/uploadposts/schedule',
      { query: { username } },
    )
    const list = Array.isArray(res?.scheduled) ? res.scheduled : []
    return list.map((raw) => {
      const r = (raw ?? {}) as Record<string, unknown>
      return {
        jobId: String(r.job_id ?? r.jobId ?? ''),
        scheduledAt: String(r.scheduled_at ?? r.scheduledAt ?? ''),
        title:
          r.title === null || r.title === undefined ? null : String(r.title),
        platforms: Array.isArray(r.platforms)
          ? (r.platforms as Platform[])
          : [],
      }
    })
  }

  async cancelScheduled(jobId: string): Promise<void> {
    await this.request<void>(
      `/api/uploadposts/schedule/${encodeURIComponent(jobId)}`,
      { method: 'DELETE' },
    )
  }

  async updateScheduled(
    jobId: string,
    updates: { scheduledAt?: Date; title?: string },
  ): Promise<void> {
    const body: Record<string, unknown> = {}
    if (updates.scheduledAt) body.scheduled_at = updates.scheduledAt.toISOString()
    if (updates.title !== undefined) body.title = updates.title
    await this.request<void>(
      `/api/uploadposts/schedule/${encodeURIComponent(jobId)}`,
      { method: 'PATCH', body },
    )
  }

  // -------------------------------------------------------------------------
  // Analytics
  // -------------------------------------------------------------------------

  /**
   * Fetch analytics for one or more platforms.
   *
   * Upload-Post's /analytics endpoint REQUIRES the `platforms` query
   * parameter (passing it as `platforms=instagram,facebook` style works
   * for multiple). The response is a flat object keyed by platform name,
   * not an array — we normalize to AnalyticsSnapshot[] for callers.
   *
   * Real response shape (per platform):
   *   {
   *     followers, reach, views, impressions, profileViews,
   *     likes, comments, shares, saves,
   *     reach_timeseries: [{ date, value }, ...]
   *   }
   */
  async getAnalytics(
    username: string,
    platforms: Platform[],
  ): Promise<AnalyticsSnapshot[]> {
    if (!platforms.length) {
      throw new UploadPostProviderError(
        'getAnalytics requires at least one platform',
        400,
        { error: 'platforms_required' },
      )
    }
    const res = await this.request<Record<string, unknown>>(
      `/api/analytics/${encodeURIComponent(username)}`,
      { query: { platforms: platforms.join(',') } },
    )
    const today = new Date().toISOString().slice(0, 10)
    return platforms.map((platform): AnalyticsSnapshot => {
      const raw = (res?.[platform] ?? {}) as Record<string, unknown>
      const followers =
        typeof raw.followers === 'number' ? raw.followers : null
      const views = typeof raw.views === 'number' ? raw.views : null
      const impressions =
        typeof raw.impressions === 'number' ? raw.impressions : null
      const likes = typeof raw.likes === 'number' ? raw.likes : 0
      const comments = typeof raw.comments === 'number' ? raw.comments : 0
      const shares = typeof raw.shares === 'number' ? raw.shares : 0
      const saves = typeof raw.saves === 'number' ? raw.saves : 0
      const engagementRate =
        impressions && impressions > 0
          ? Number(
              (((likes + comments + shares + saves) / impressions) * 100).toFixed(2),
            )
          : null
      return {
        platform,
        followers,
        views,
        impressions,
        engagementRate,
        postsCount: null,
        snapshotDate: today,
      }
    })
  }

  // -------------------------------------------------------------------------
  // Queue settings
  // -------------------------------------------------------------------------

  async getQueueSettings(username: string): Promise<QueueSettings> {
    const res = await this.request<QueueSettings>(
      '/api/uploadposts/queue/settings',
      { query: { username } },
    )
    return {
      timezone: String(res?.timezone ?? 'UTC'),
      slots: Array.isArray(res?.slots) ? res.slots : [],
      enabled: Boolean(res?.enabled),
    }
  }

  async updateQueueSettings(
    username: string,
    settings: QueueSettings,
  ): Promise<QueueSettings> {
    const res = await this.request<QueueSettings>(
      '/api/uploadposts/queue/settings',
      { method: 'POST', body: { username, ...settings } },
    )
    return {
      timezone: String(res?.timezone ?? settings.timezone),
      slots: Array.isArray(res?.slots) ? res.slots : settings.slots,
      enabled: typeof res?.enabled === 'boolean' ? res.enabled : settings.enabled,
    }
  }

  async previewSlots(username: string): Promise<QueueSlotPreview[]> {
    const res = await this.request<{ slots?: unknown[] }>(
      '/api/uploadposts/queue/preview',
      { query: { username } },
    )
    const list = Array.isArray(res?.slots) ? res.slots : []
    return list.map((raw) => {
      const r = (raw ?? {}) as Record<string, unknown>
      return {
        timestamp: String(r.timestamp ?? ''),
        day: String(r.day ?? ''),
        hour: Number(r.hour ?? 0),
        minute: Number(r.minute ?? 0),
      }
    })
  }

  async getNextSlot(username: string): Promise<QueueSlotPreview> {
    const res = await this.request<Record<string, unknown>>(
      '/api/uploadposts/queue/next-slot',
      { query: { username } },
    )
    return {
      timestamp: String(res?.timestamp ?? ''),
      day: String(res?.day ?? ''),
      hour: Number(res?.hour ?? 0),
      minute: Number(res?.minute ?? 0),
    }
  }

  // -------------------------------------------------------------------------
  // Sub-accounts (Facebook pages / LinkedIn company pages / Pinterest boards)
  // -------------------------------------------------------------------------

  async getFacebookPages(username: string): Promise<PlatformPage[]> {
    return this.getPagesGeneric('/api/uploadposts/facebook/pages', username)
  }

  async getLinkedinCompanyPages(username: string): Promise<PlatformPage[]> {
    return this.getPagesGeneric('/api/uploadposts/linkedin/pages', username)
  }

  async getPinterestBoards(username: string): Promise<PlatformPage[]> {
    return this.getPagesGeneric('/api/uploadposts/pinterest/boards', username)
  }

  private async getPagesGeneric(
    path: string,
    username: string,
  ): Promise<PlatformPage[]> {
    const res = await this.request<{ items?: unknown[] }>(path, {
      query: { username },
    })
    const list = Array.isArray(res?.items) ? res.items : []
    return list.map((raw) => {
      const r = (raw ?? {}) as Record<string, unknown>
      return { id: String(r.id ?? ''), name: String(r.name ?? '') }
    })
  }

  // -------------------------------------------------------------------------
  // FFmpeg jobs
  // -------------------------------------------------------------------------

  async submitFFmpegJob(params: FFmpegJobParams): Promise<{ jobId: string }> {
    const res = await this.request<{ job_id?: string; jobId?: string }>(
      '/api/uploadposts/ffmpeg/jobs/upload',
      {
        method: 'POST',
        body: {
          source_url: params.sourceUrl,
          operations: params.operations,
        },
      },
    )
    return { jobId: String(res?.job_id ?? res?.jobId ?? '') }
  }

  async getFFmpegJobStatus(jobId: string): Promise<FFmpegJobStatus> {
    const res = await this.request<Record<string, unknown>>(
      `/api/uploadposts/ffmpeg/jobs/${encodeURIComponent(jobId)}`,
    )
    return {
      jobId: String(res?.job_id ?? res?.jobId ?? jobId),
      status: (res?.status as FFmpegJobStatus['status']) ?? 'pending',
      resultUrl:
        res?.result_url || res?.resultUrl
          ? String(res?.result_url ?? res?.resultUrl)
          : undefined,
      errorMessage:
        res?.error_message || res?.errorMessage
          ? String(res?.error_message ?? res?.errorMessage)
          : undefined,
      progress: typeof res?.progress === 'number' ? res.progress : undefined,
    }
  }

  async getFFmpegConsumption(): Promise<FFmpegConsumption> {
    const res = await this.request<Record<string, unknown>>(
      '/api/uploadposts/ffmpeg/consumption',
    )
    return {
      minutesUsed: Number(res?.minutes_used ?? res?.minutesUsed ?? 0),
      minutesRemaining: Number(
        res?.minutes_remaining ?? res?.minutesRemaining ?? 0,
      ),
      planLimit: Number(res?.plan_limit ?? res?.planLimit ?? 0),
    }
  }

  // -------------------------------------------------------------------------
  // Webhooks
  // -------------------------------------------------------------------------

  /**
   * Registra el webhook de la CUENTA (una sola vez para toda la agencia; los
   * eventos traen `profile_username` para saber de qué perfil hablan). Body
   * según la doc de Webhooks: `channels` + `webhook_url` + `webhook_events`.
   */
  async configureWebhook(
    webhookUrl: string,
    events: string[],
  ): Promise<WebhookConfigResult> {
    await this.request<void>('/api/uploadposts/users/notifications', {
      method: 'POST',
      body: {
        channels: { webhook: true, telegram: false },
        webhook_url: webhookUrl,
        webhook_events: events,
      },
    })
    return { configured: true, webhookUrl, events }
  }

  verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string,
  ): boolean {
    try {
      const computed = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex')
      const a = Buffer.from(computed, 'utf8')
      const b = Buffer.from(signature, 'utf8')
      if (a.length !== b.length) return false
      return crypto.timingSafeEqual(a, b)
    } catch {
      return false
    }
  }
}
