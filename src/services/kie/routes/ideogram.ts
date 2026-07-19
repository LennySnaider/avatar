/**
 * Ruta Ideogram V3 — text-to-image, NO permisivo (pasa por sanitización).
 *
 * Aislada: usa el enum `image_size` (no `aspect_ratio`) y `rendering_speed`.
 * Sin i2i (ideogram no está en el set i2i de KIE). Reproduce exactamente lo
 * que hacía legacy para 'ideogram/*' (verificado por snapshot).
 */

import type { ImageRoute, ImageRouteContext, KieImageRequest } from '../context'
import {
    relocatePoseTag,
    capAtWordBoundary,
    aspectToImageSize,
} from '../shared'

async function build(ctx: ImageRouteContext): Promise<KieImageRequest> {
    // ideogram NO es nano-banana-2 → reubica la pose; cap genérico 1800.
    const promptText = relocatePoseTag(ctx.prompt)
    const capped = capAtWordBoundary(promptText, 1800, ctx.model)
    const input: Record<string, unknown> = {
        prompt: capped,
        image_size: aspectToImageSize(ctx.aspectRatio),
        rendering_speed: 'QUALITY',
    }
    return { model: ctx.model, input, fullApiPrompt: promptText }
}

export const ideogramRoute: ImageRoute = {
    label: 'ideogram',
    matches: (m) => m.startsWith('ideogram/'),
    isPermissive: false,
    build,
}
