import { UploadPostProvider } from '@/lib/social/providers/UploadPostProvider'
import type { SocialProvider } from '@/lib/social/providers/SocialProvider'

const cache = new Map<string, SocialProvider>()

/**
 * Provider factory, one Upload-Post account per avatar: each avatar's
 * `social_profiles` row stores its own API key. Passing no key (or null)
 * falls back to env `UPLOAD_POST_API_KEY` — that path is reserved for the
 * legacy migrated row (api_key NULL + status 'active').
 */
export function getSocialProvider(apiKey?: string | null): SocialProvider {
    const key = apiKey?.trim() || process.env.UPLOAD_POST_API_KEY
    if (!key) throw new Error('No Upload-Post API key available')
    let provider = cache.get(key)
    if (!provider) {
        provider = new UploadPostProvider(key, process.env.UPLOAD_POST_BASE_URL)
        cache.set(key, provider)
    }
    return provider
}

/**
 * Deterministic Upload-Post sub-user name for a NEW avatar profile, e.g.
 * MiaUltra → `miaultra-3d2bfe4e`. Reconnects must reuse the existing row's
 * `upload_post_username` instead (it is UNIQUE in our DB, and the profile
 * already exists on the Upload-Post side).
 */
export function deriveUploadPostUsername(avatar: { id: string; name: string }): string {
    const slug =
        avatar.name
            .toLowerCase()
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 24) || 'avatar'
    return `${slug}-${avatar.id.slice(0, 8)}`
}
