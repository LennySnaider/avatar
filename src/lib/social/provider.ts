import { UploadPostProvider } from '@/lib/social/providers/UploadPostProvider'
import type { SocialProvider } from '@/lib/social/providers/SocialProvider'

/** Fixed Upload-Post sub-user for this single-user app. */
export const SOCIAL_USERNAME = 'prime-avatar'

let cached: SocialProvider | null = null

/**
 * Single-user replacement for AgentSoft's providerFactory/uploadPostConfig
 * chain: one dedicated Upload-Post account, key from env.
 */
export function getSocialProvider(): SocialProvider {
    if (cached) return cached
    const apiKey = process.env.UPLOAD_POST_API_KEY
    if (!apiKey) throw new Error('UPLOAD_POST_API_KEY is not configured')
    cached = new UploadPostProvider(apiKey, process.env.UPLOAD_POST_BASE_URL)
    return cached
}
