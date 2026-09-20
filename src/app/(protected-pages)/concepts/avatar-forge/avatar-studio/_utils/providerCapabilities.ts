import type { AIProvider } from '@/@types/supabase'
import type { VideoResolution, ImageResolution } from '../types'
import { engineCaps } from '@/services/kie/engineCaps'

/**
 * Valid output durations (in seconds) for each video provider. Single
 * source of truth so the Continue dialog and any future duration UI all
 * agree on what's selectable.
 *
 * The numbers come from each provider's documented or empirically verified
 * limits — Kling: 5/10, MiniMax: 6/10, Veo 3 (Gemini): fixed 8s, Seedance:
 * 4–15, Wan 2.7: 2–15. Adjust as new models or tiers ship.
 */
export function getDurationOptionsForProvider(
    provider: AIProvider | null,
): number[] {
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
            if (provider.model === 'kling-3.0/video') return [5, 10]
            if (provider.model === 'bytedance/seedance-2')
                return [4, 5, 6, 8, 10, 12, 15]
            // Seedance 2.5 llega a 30s ("Video duration in 4-30 seconds"). El
            // `-1` = "que elija el modelo" que acepta la API NO se expone: con
            // precio por segundo, una duración decidida río arriba es un cobro
            // que no se puede cotizar antes del hold.
            if (provider.model === 'bytedance/seedance-2-5')
                return [4, 5, 6, 8, 10, 12, 15, 20, 25, 30]
            if (provider.model === 'wan/2-7-image-to-video')
                return [2, 5, 7, 10, 12, 15]
            // Wan 2.6 unificado (MuleRouter): la API acepta 5/10/15; si la
            // ruta automática cae en r2v (que rechaza 15) el submit ya
            // redondea a 10.
            if (provider.model?.startsWith('mulerouter/wan2.6'))
                return [5, 10, 15]
            // Wan 2.2 turbo no expone duración — clip fijo (~5s).
            if (provider.model === 'wan/2-2-a14b-image-to-video-turbo')
                return [5]
            // Wan 3.0: entero 2-30s (el 31 vuelve con 422). El -1 de "que
            // elija el modelo" NO se expone — con precio POR SEGUNDO, una
            // duración decidida río arriba es un cobro que no se puede
            // cotizar antes del hold (mismo criterio que Seedance 2.5).
            if (provider.model === 'wan/3-0-video')
                return [2, 5, 10, 15, 20, 25, 30]
            // Grok Imagine Video 1.5: entero 1-15s (default 8).
            if (provider.model === 'grok-imagine-video-1-5-preview')
                return [4, 6, 8, 10, 12, 15]
            // Older KIE models (Veo via aggregator, etc.) — sane default.
            return [5]
        case 'GATEWAY':
            // Image-only in the current spike; duration is unused. When video
            // models land, branch on provider.model here (kling/veo/seedance).
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
    return options.reduce(
        (best, opt) =>
            Math.abs(opt - desired) < Math.abs(best - desired) ? opt : best,
        options[0],
    )
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
            if (provider.model === 'kling-3.0/video') return ['720p', '1080p']
            if (provider.model === 'bytedance/seedance-2')
                return ['480p', '720p', '1080p']
            // 2.5 NO tiene 1080p — al revés de lo que sugiere el número de
            // versión: "480p for faster generation, 720p for balance".
            if (provider.model === 'bytedance/seedance-2-5')
                return ['480p', '720p']
            if (provider.model === 'wan/2-7-image-to-video')
                return ['720p', '1080p']
            // Wan 2.6 unificado (MuleRouter): el submit mapea a 720P/1080P
            // (i2v vía `resolution`, t2v/r2v vía `size`).
            if (provider.model?.startsWith('mulerouter/wan2.6'))
                return ['720p', '1080p']
            if (provider.model === 'wan/2-2-a14b-image-to-video-turbo')
                return ['480p', '720p']
            // Minúsculas de cara a la UI (su convención); buildWan30Input las
            // sube a '480P'/'720P'/'1080P', que es lo único que acepta la API.
            if (provider.model === 'wan/3-0-video')
                return ['480p', '720p', '1080p']
            if (provider.model === 'grok-imagine-video-1-5-preview')
                return ['480p', '720p']
            // Other KIE models (legacy Veo wiring, etc.) don't expose resolution.
            return null
        case 'GATEWAY':
            // Image-only spike — no video resolution control yet.
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

/**
 * Tramos de resolución que ofrece un motor de IMAGEN, o `null` si no expone la
 * elección — que es el caso de TODOS los motores anteriores a Qwen 3 y GPT
 * Image 2.5: cada uno fija la suya dentro de su ruta. Devolver `null` hace dos
 * cosas a la vez: la UI esconde el control, y el submit no manda `resolution`,
 * así que `quote()` sigue cobrando su precio plano de siempre. El cobro por
 * tramo se estrena SOLO donde hay tramos declarados.
 */
export function getImageResolutionOptionsForProvider(
    provider: AIProvider | null,
): ImageResolution[] | null {
    if (!provider || provider.type !== 'KIE') return null
    const caps = engineCaps(provider.model)
    if (!caps || caps.resolutions.length < 2) return null
    return [...caps.resolutions]
}

/**
 * Ajusta la resolución deseada a lo que acepta el motor. Al no haber opción,
 * devuelve la deseada tal cual: el caller esconde el control y ese valor nunca
 * llega a viajar.
 */
export function clampImageResolutionForProvider(
    provider: AIProvider | null,
    desired: ImageResolution,
): ImageResolution {
    const options = getImageResolutionOptionsForProvider(provider)
    if (!options) return desired
    if (options.includes(desired)) return desired
    // Degradar antes que subir: nadie quiere descubrir un 4K en la factura.
    const order: ImageResolution[] = ['1K', '2K', '4K']
    for (let i = order.indexOf(desired); i >= 0; i--) {
        if (options.includes(order[i])) return order[i]
    }
    return options[0]
}
