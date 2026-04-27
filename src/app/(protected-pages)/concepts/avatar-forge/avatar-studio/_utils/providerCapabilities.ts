import type { AIProvider } from '@/@types/supabase'

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
