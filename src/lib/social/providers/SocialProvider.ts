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
  Platform,
  PlatformTarget,
  QueueSettings,
} from '@/@types/social'

// ---------------------------------------------------------------------------
// Shared value types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface SocialProvider {
  // --- Profiles ---
  createProfile(username: string): Promise<{ username: string }>
  getProfile(username: string): Promise<ProfileDetails>
  deleteProfile(username: string): Promise<void>
  listProfiles(): Promise<ProfileDetails[]>

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
  configureWebhook(
    username: string,
    webhookUrl: string,
    events: string[],
  ): Promise<WebhookConfigResult>
  verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string,
  ): boolean
}
