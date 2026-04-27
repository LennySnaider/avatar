import type { AIProvider } from '@/@types/supabase'
import type { VideoResolution } from '../types'

/**
 * Valid output durations (in seconds) for each video provider. Single
 * source of truth so the Continue dialog and any future duration UI all
 * agree on what's selectable.
 *
 * The numbers come from each provider's documented or empirically verified
 * limits — Kling: 5/10, MiniMax: 6/10, Veo 3 (Gemini): fixed 8s, Seedance:
 * 4–15, Wan 2.7: 2–15. Adjust as new models or tiers ship.
 */
export function getDurationOptionsForProvider(provider: AIProvider | null): number[] {
    if (!provider) return [5]
    switch (provider.type) {
        case 'KLING':
            return [5, 10]
        case 'MINIMAX':
            return [6, 10]
        case 'GOOGLE':
            // Veo 3 has a fixed duration; expose a single option for clarity.
            return [8]
        case 'KIE':
            if (provider.model === 'bytedance/seedance-2') return [4, 5, 6, 8, 10, 12, 15]
            if (provider.model === 'wan/2-7-image-to-video') return [2, 5, 7, 10, 12, 15]
            // Older KIE models (Veo via aggregator, etc.) — sane default.
            return [5]
        default:
            return [5]
    }
}

/**
 * Snap a desired duration to the nearest valid option for the given
 * provider so a stale selection from a different provider doesn't
 * break the request.
 */
export function clampDurationForProvider(
    provider: AIProvider | null,
    desired: number,
): number {
    const options = getDurationOptionsForProvider(provider)
    if (options.includes(desired)) return desired
    return options.reduce((best, opt) =>
        Math.abs(opt - desired) < Math.abs(best - desired) ? opt : best,
    options[0])
}

/**
 * Valid output resolutions per provider, expressed in our internal
 * VideoResolution enum. Returns `null` for providers that don't expose
 * a pixel-resolution choice (Kling uses quality presets internally) so
 * the UI can hide the control entirely instead of showing values that
 * silently get ignored.
 */
export function getResolutionOptionsForProvider(
    provider: AIProvider | null,
): VideoResolution[] | null {
    if (!provider) return null
    switch (provider.type) {
        case 'KLING':
            // Kling uses quality presets ('std' / 'high'), not pixel resolution.
            return null
        case 'MINIMAX':
            // Hailuo 2.3 supports 768P (mapped to 720p in our enum) and 1080P.
            // The Fast variant is capped at 768P.
            if (provider.model === 'MiniMax-Hailuo-2.3-Fast') return ['720p']
            return ['720p', '1080p']
        case 'GOOGLE':
            return ['720p', '1080p']
        case 'KIE':
            if (provider.model === 'bytedance/seedance-2') return ['480p', '720p', '1080p']
            if (provider.model === 'wan/2-7-image-to-video') return ['720p', '1080p']
            // Other KIE models (legacy Veo wiring, etc.) don't expose resolution.
            return null
        default:
            return null
    }
}

/**
 * Snap a desired resolution to the nearest valid option for the given
 * provider. Falls back to '720p' if the provider doesn't expose a pixel
 * resolution at all (caller should hide the UI in that case but the
 * returned value remains a usable default for the store).
 */
export function clampResolutionForProvider(
    provider: AIProvider | null,
    desired: VideoResolution,
): VideoResolution {
    const options = getResolutionOptionsForProvider(provider)
    if (!options) return desired
    if (options.includes(desired)) return desired
    // Prefer downgrading rather than upgrading silently.
    const order: VideoResolution[] = ['480p', '720p', '1080p']
    const desiredIdx = order.indexOf(desired)
    for (let i = desiredIdx; i >= 0; i--) {
        if (options.includes(order[i])) return order[i]
    }
    return options[0]
}
