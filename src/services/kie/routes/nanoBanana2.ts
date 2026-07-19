/**
 * Ruta Nano Banana 2 (Gemini 3.x Flash Image) — full y el alias -lite.
 *
 * Aislada. Particularidades que la distinguen del resto:
 *  - NO reubica la pose ni corre stripIdentityRedundancy (usa el harness del
 *    cliente + la imagen de pose/[POSE_REF]); cap enorme (19000).
 *  - Manda TODOS los refs en su ORDEN original vía `image_input` (hasta 14) —
 *    el REFERENCE MAPPING del harness del cliente los etiqueta Image 1..N.
 *  - 'nano-banana-2-lite' es alias de tier: mismo id real 'nano-banana-2' pero
 *    resolution 1K (el precio Lite). resolvedModel se traduce; la resolución
 *    se decide por el id de entrada.
 * Reproduce exactamente lo que hacía legacy para 'nano-banana-2*'.
 */

import type { ImageRoute, ImageRouteContext, KieImageRequest } from '../context'
import {
    capAtWordBoundary,
    resolveModelAlias,
    hairClause as buildHairClause,
} from '../shared'

async function build(ctx: ImageRouteContext): Promise<KieImageRequest> {
    const hairClause = buildHairClause(ctx.hairEmphasis)
    const model = ctx.model
    const resolvedModel = resolveModelAlias(model) // → 'nano-banana-2'

    // NO relocate, NO strip para la familia nano-banana-2.
    const promptText = ctx.prompt
    const capped = capAtWordBoundary(promptText, 19000, model)
    const input: Record<string, unknown> = {
        prompt: capped,
        aspect_ratio: ctx.aspectRatio,
        resolution: model === 'nano-banana-2-lite' ? '1K' : '2K',
    }

    if (ctx.referenceImage) {
        try {
            const nbRefs = (
                ctx.referenceImages && ctx.referenceImages.length > 0
                    ? ctx.referenceImages
                    : [ctx.referenceImage]
            ).slice(0, 14)
            const nbUrls: string[] = []
            for (const r of nbRefs) {
                nbUrls.push(await ctx.uploadRef(r.base64, r.mimeType))
            }
            input.image_input = nbUrls
            input.prompt = `The person in the first attached reference image is the subject — keep her EXACT face, facial features and likeness.${hairClause} ${input.prompt}`
            console.log(
                `[KIE] ${model} with ${nbUrls.length} ref(s) via image_input (roles: ${nbRefs.map((r) => ('role' in r && r.role) || 'face').join(', ')})`,
            )
        } catch (e) {
            console.warn('[KIE] ref upload failed, staying text-only:', e)
        }
    }

    return { model: resolvedModel, input, fullApiPrompt: promptText }
}

export const nanoBanana2Route: ImageRoute = {
    label: 'nano-banana-2',
    matches: (m) => m.startsWith('nano-banana-2'),
    isPermissive: false,
    build,
}
