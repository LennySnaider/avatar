/**
 * Per-platform caption + hashtag validators.
 *
 * Limits are derived from official docs; `mediaMax` is only defined for
 * platforms that have a known ceiling on carousel/gallery size.
 *
 * Consumers should surface `errorKey` to i18n layer — this module
 * intentionally stays free of user-facing copy.
 */

import type { Platform } from '@/@types/social'

export interface PlatformLimits {
  captionMax: number
  hashtagsMax: number
  mediaMax?: number
}

export const PLATFORM_LIMITS: Record<Platform, PlatformLimits> = {
  instagram: { captionMax: 2200, hashtagsMax: 30, mediaMax: 10 },
  facebook: { captionMax: 63206, hashtagsMax: 30 },
  tiktok: { captionMax: 2200, hashtagsMax: 100 },
  linkedin: { captionMax: 3000, hashtagsMax: 30 },
  youtube: { captionMax: 5000, hashtagsMax: 15 },
  x: { captionMax: 280, hashtagsMax: 10 },
  threads: { captionMax: 500, hashtagsMax: 10 },
  pinterest: { captionMax: 500, hashtagsMax: 20 },
  reddit: { captionMax: 40000, hashtagsMax: 0 },
  bluesky: { captionMax: 300, hashtagsMax: 10 },
}

export type ValidationErrorKey = 'caption_too_long' | 'too_many_hashtags'

export interface ValidationResult {
  valid: boolean
  errorKey?: ValidationErrorKey
  details?: {
    actual: number
    limit: number
    platform: Platform
  }
}

export function validateCaption(
  caption: string,
  platform: Platform,
  hashtags: string[] = [],
): ValidationResult {
  const limits = PLATFORM_LIMITS[platform]

  if (caption.length > limits.captionMax) {
    return {
      valid: false,
      errorKey: 'caption_too_long',
      details: {
        actual: caption.length,
        limit: limits.captionMax,
        platform,
      },
    }
  }

  if (hashtags.length > limits.hashtagsMax) {
    return {
      valid: false,
      errorKey: 'too_many_hashtags',
      details: {
        actual: hashtags.length,
        limit: limits.hashtagsMax,
        platform,
      },
    }
  }

  return { valid: true }
}

export function validatePostForPlatforms(
  caption: string,
  platforms: Platform[],
  hashtags: string[] = [],
): Partial<Record<Platform, ValidationResult>> {
  const out: Partial<Record<Platform, ValidationResult>> = {}
  for (const platform of platforms) {
    out[platform] = validateCaption(caption, platform, hashtags)
  }
  return out
}
