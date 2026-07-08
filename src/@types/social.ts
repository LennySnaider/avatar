/**
 * Social Media Scheduling Module — Shared types
 * @see docs/superpowers/specs/2026-04-20-social-media-scheduling-design.md
 */

export type Platform =
  | 'instagram'
  | 'facebook'
  | 'tiktok'
  | 'linkedin'
  | 'youtube'
  | 'x'
  | 'threads'
  | 'pinterest'
  | 'reddit'
  | 'bluesky'

export const ALL_PLATFORMS: Platform[] = [
  'instagram',
  'facebook',
  'tiktok',
  'linkedin',
  'youtube',
  'x',
  'threads',
  'pinterest',
  'reddit',
  'bluesky',
]

export type ContentType = 'video' | 'photo' | 'carousel' | 'text' | 'document'

export type PostStatus =
  | 'draft'
  | 'scheduled'
  | 'processing'
  | 'published'
  | 'failed'
  | 'cancelled'

export type ProfileStatus = 'active' | 'suspended' | 'deleted'

export interface PlatformParams {
  captionOverride?: string
  privacy?: string
  allowComment?: boolean
  allowDuet?: boolean
  coverUrl?: string
  targetPageId?: string
  targetBoardId?: string
  visibility?: 'public' | 'connections'
}

export interface PlatformTarget {
  platform: Platform
  params?: PlatformParams
}

export interface ConnectedAccount {
  platform: Platform
  accountName: string
  accountId: string
  connectedAt: string
  avatarUrl?: string
  followersCount?: number
}

export interface SocialProfileRow {
  id: string
  uploadPostUsername: string
  status: ProfileStatus
  connectedPlatforms: ConnectedAccount[]
  uploadPostMetadata: Record<string, unknown>
  lastSyncedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface SocialPostRow {
  id: string
  socialProfileId: string
  title: string | null
  caption: string
  hashtags: string[]
  contentType: ContentType
  mediaFiles: string[]
  externalMediaUrls: string[]
  platforms: PlatformTarget[]
  status: PostStatus
  scheduledAt: string | null
  publishedAt: string | null
  uploadPostRequestId: string | null
  uploadPostJobId: string | null
  uploadPostResponse: Record<string, unknown> | null
  errorMessage: string | null
  ffmpegJobId: string | null
  processedMediaUrl: string | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface AnalyticsSnapshot {
  platform: Platform
  followers: number | null
  views: number | null
  impressions: number | null
  engagementRate: number | null
  postsCount: number | null
  snapshotDate: string
}

export type WeekDay =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday'

export interface QueueSlot {
  day: WeekDay
  hour: number
  minute: number
}

export interface QueueSettings {
  timezone: string
  slots: QueueSlot[]
  enabled: boolean
}

export type SocialEventType =
  | 'profile_created'
  | 'profile_deleted'
  | 'account_connected'
  | 'account_disconnected'
  | 'post_submitted'
  | 'post_scheduled'
  | 'post_published'
  | 'post_failed'
  | 'post_cancelled'
  | 'ffmpeg_job_started'
  | 'ffmpeg_job_completed'
  | 'ffmpeg_job_failed'

export type SocialActorType = 'user' | 'system' | 'webhook' | 'workflow'

export interface SocialEventLog {
  id: string
  socialProfileId: string | null
  socialPostId: string | null
  eventType: SocialEventType
  platform: Platform | null
  actorType: SocialActorType
  actorId: string | null
  payload: Record<string, unknown>
  createdAt: string
}

export interface UploadPostWebhookEvent {
  event:
    | 'post.published'
    | 'post.failed'
    | 'account.connected'
    | 'account.disconnected'
    | 'ffmpeg.completed'
  username: string
  requestId?: string
  jobId?: string
  platform?: Platform
  data?: Record<string, unknown>
  timestamp: string
}
