/**
 * SocialProvider — Provider-agnostic interface for social media scheduling
 *
 * Concrete implementations:
 *  - UploadPostProvider (REST wrapper over Upload-Post API)
 *  - MockProvider (in-memory, deterministic, for tests)
 *
 * @see docs/superpowers/specs/2026-04-20-social-media-scheduling-design.md
 */

import type {
  AnalyticsSnapshot,
  ConnectedAccount,
  CreateCommentResult,
  InstagramDmButton,
  Platform,
  PlatformTarget,
  PrivateReplyResult,
  QueueSettings,
  SocialCommentsPage,
  UploadPostHistoryEntry,
} from '@/@types/social'

// ---------------------------------------------------------------------------
// Shared value types
// ---------------------------------------------------------------------------

/**
 * Último snapshot de rate-limit visto en cualquier respuesta del proveedor
 * (headers `x-ratelimit-*`). F4.2 Tarea 5 (comentarios-ia-social): vivía sólo
 * en `UploadPostProvider.ts` (única implementación); se sube a la interfaz
 * porque el sondeo de comentarios (`src/lib/social/comments/poll.ts`) lo
 * necesita a través del tipo `SocialProvider`, no de la clase concreta.
 */
export interface RateLimitInfo {
  limit: number | null
  remaining: number | null
  reset: number | null
}

export interface ProfileDetails {
  username: string
  connectedAccounts: ConnectedAccount[]
  metadata?: Record<string, unknown>
}

export interface GenerateConnectUrlParams {
  username: string
  redirectUrl: string
  logoUrl?: string
  platforms?: Platform[]
  showCalendar?: boolean
  readonlyCalendar?: boolean
  connectTitle?: string
  connectDescription?: string
  redirectButtonText?: string
}

export interface GenerateConnectUrlResult {
  accessUrl: string
  expiresAt: Date
}

export interface PublishParams {
  username: string
  caption: string
  platforms: PlatformTarget[]
  title?: string
  scheduledAt?: Date
}

export interface VideoPostParams extends PublishParams {
  videoUrl: string
  coverUrl?: string
  /** Etiqueta de la pista YA embebida en el MP4, para el Reel de Instagram.
   *  Es sólo el nombre que Instagram muestra: no adjunta ninguna pista (eso
   *  requiere la Audio API de Meta, que Upload-Post no expone todavía). */
  audioName?: string
}

export interface PhotoPostParams extends PublishParams {
  photoUrls: string[]
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface TextPostParams extends PublishParams {}

export interface DocumentPostParams extends PublishParams {
  documentUrl: string
  documentTitle: string
}

export interface PublishResponse {
  requestId: string
  totalPlatforms: number
}

export interface RequestStatus {
  status: string
  data?: Record<string, unknown>
}

export interface HistoryEntry {
  id: string
  status: string
  createdAt: string
}

export interface ScheduledPost {
  jobId: string
  scheduledAt: string
  title: string | null
  platforms: Platform[]
}

export interface QueueSlotPreview {
  timestamp: string
  day: string
  hour: number
  minute: number
}

export interface PlatformPage {
  id: string
  name: string
}

export interface FFmpegOperations {
  resize?: { w: number; h: number }
  reframe?: { aspectRatio: string }
  compress?: { quality: number }
  trim?: { start: number; end: number }
}

export interface FFmpegJobParams {
  sourceUrl: string
  operations: FFmpegOperations
}

export interface FFmpegJobStatus {
  jobId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  resultUrl?: string
  errorMessage?: string
  progress?: number
}

export interface FFmpegConsumption {
  minutesUsed: number
  minutesRemaining: number
  planLimit: number
}

export interface WebhookConfigResult {
  configured: boolean
  webhookUrl: string
  events: string[]
}

/**
 * Respuesta de `GET /api/uploadposts/users` en la cuenta agencia: además de
 * los perfiles trae el plan y el tope de perfiles (verificado en vivo el
 * 2026-09-17: `{ plan: "professional", limit: 25, profiles: [...] }`).
 */
export interface AccountProfiles {
  plan: string | null
  limit: number | null
  profiles: ProfileDetails[]
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface SocialProvider {
  // --- Profiles ---
  createProfile(username: string): Promise<{ username: string }>
  getProfile(username: string): Promise<ProfileDetails>
  deleteProfile(username: string): Promise<void>
  listProfiles(): Promise<AccountProfiles>

  // --- Connect flow ---
  generateConnectUrl(
    params: GenerateConnectUrlParams,
  ): Promise<GenerateConnectUrlResult>
  validateJwt(
    token: string,
  ): Promise<{ valid: boolean; username?: string }>

  // --- Publishing ---
  publishVideo(params: VideoPostParams): Promise<PublishResponse>
  publishPhoto(params: PhotoPostParams): Promise<PublishResponse>
  publishText(params: TextPostParams): Promise<PublishResponse>
  publishDocument(params: DocumentPostParams): Promise<PublishResponse>

  // --- Status + history ---
  getRequestStatus(requestId: string): Promise<RequestStatus>
  getHistory(username: string, limit?: number): Promise<HistoryEntry[]>
  // listHistory usa `profile_username` (getHistory de arriba manda `username`,
  // que la doc real no reconoce — ver comentario en UploadPostProvider).
  listHistory(input: {
    profileUsername: string
    requestId?: string
    jobId?: string
    platform?: string
    limit?: 10 | 20 | 50 | 100
  }): Promise<UploadPostHistoryEntry[]>

  /** Snapshot de rate-limit de la última respuesta HTTP, o null si aún no
   *  se hizo ninguna. El sondeo de comentarios lo consulta antes de cada
   *  página para frenar cuando `remaining < 5` (ver `pollRules.rateLimitLow`). */
  getLastRateLimit(): RateLimitInfo | null

  // --- Comentarios / respuestas ---
  listComments(input: {
    username: string
    platform: Platform
    postId?: string
    postUrl?: string
    limit?: number
    after?: string
    commentId?: string
  }): Promise<SocialCommentsPage>
  createComment(input: {
    username: string
    platform: Platform
    message: string
    commentId?: string
    postId?: string
    postUrl?: string
  }): Promise<CreateCommentResult>
  sendInstagramPrivateReply(input: {
    username: string
    commentId: string
    message: string
    buttons?: InstagramDmButton[]
  }): Promise<PrivateReplyResult>

  // --- Scheduling ---
  listScheduled(username: string): Promise<ScheduledPost[]>
  cancelScheduled(jobId: string): Promise<void>
  updateScheduled(
    jobId: string,
    updates: { scheduledAt?: Date; title?: string },
  ): Promise<void>

  // --- Analytics ---
  // Upload-Post REQUIRES at least one platform; passing an empty array
  // throws. Pass all the platforms you want a snapshot for.
  getAnalytics(
    username: string,
    platforms: Platform[],
  ): Promise<AnalyticsSnapshot[]>

  // --- Queue settings ---
  getQueueSettings(username: string): Promise<QueueSettings>
  updateQueueSettings(
    username: string,
    settings: QueueSettings,
  ): Promise<QueueSettings>
  previewSlots(username: string): Promise<QueueSlotPreview[]>
  getNextSlot(username: string): Promise<QueueSlotPreview>

  // --- Platform sub-accounts ---
  getFacebookPages(username: string): Promise<PlatformPage[]>
  getLinkedinCompanyPages(username: string): Promise<PlatformPage[]>
  getPinterestBoards(username: string): Promise<PlatformPage[]>

  // --- FFmpeg (video transforms) ---
  submitFFmpegJob(params: FFmpegJobParams): Promise<{ jobId: string }>
  getFFmpegJobStatus(jobId: string): Promise<FFmpegJobStatus>
  getFFmpegConsumption(): Promise<FFmpegConsumption>

  // --- Webhooks ---
  // Por CUENTA (una registración para toda la agencia), no por perfil.
  configureWebhook(
    webhookUrl: string,
    events: string[],
  ): Promise<WebhookConfigResult>
  verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string,
  ): boolean
}
