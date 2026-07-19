/**
 * Ruta z-image (Tongyi) — text-to-image PERMISIVO, sin i2i.
 *
 * Aislada: dueña de su cap (1500) y sus params. No usa `planExtraRefs` ni
 * ancla i2i (z-image no está en el set i2i de KIE) → ignora refs. Reproduce
 * exactamente lo que hacía legacy para 'z-image' (verificado por snapshot).
 */

import type { ImageRoute, ImageRouteContext, KieImageRequest } from '../context'
import { relocatePoseTag, capAtWordBoundary } from '../shared'

async function build(ctx: ImageRouteContext): Promise<KieImageRequest> {
    // z-image NO es nano-banana-2 → reubica la pose al frente.
    const promptText = relocatePoseTag(ctx.prompt)
    const capped = capAtWordBoundary(promptText, 1500, ctx.model)
    const input: Record<string, unknown> = {
        prompt: capped,
        aspect_ratio: ctx.aspectRatio,
        nsfw_checker: false,
    }
    return { model: ctx.model, input, fullApiPrompt: promptText }
}

export const zImageRoute: ImageRoute = {
    label: 'z-image',
    matches: (m) => m === 'z-image',
    isPermissive: true,
    build,
}
