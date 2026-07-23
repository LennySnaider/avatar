/**
 * Ruta FLUX.2 Pro (Black Forest Labs) — i2i PERMISIVO, hasta 8 input_urls.
 *
 * Aislada. Reubica la pose; NO corre stripIdentityRedundancy (no es seedream/wan)
 * → el ancla se antepone al prompt tal cual (sin presupuesto de escena aparte).
 * `planExtraRefs(_, 7)`. Reproduce exactamente lo que hacía legacy para 'flux-2/*'.
 */

import type { ImageRoute, ImageRouteContext, KieImageRequest } from '../context'
import {
    planExtraRefs,
    relocatePoseTag,
    capAtWordBoundary,
    INTACT_BODY_CLAUSE,
    hairClause as buildHairClause,
    eyeClause as buildEyeClause,
    faceFidelityClause as buildFaceFidelityClause,
} from '../shared'

async function build(ctx: ImageRouteContext): Promise<KieImageRequest> {
    const hairClause = buildHairClause(ctx.hairEmphasis)
    const eyeClause = buildEyeClause(ctx.eyeEmphasis)
    const faceFidelityClause = buildFaceFidelityClause(ctx.identityWeight)
    const model = ctx.model

    // FLUX.2 NO es nano → reubica la pose; cap 1800; sin strip.
    const promptText = relocatePoseTag(ctx.prompt)
    const capped = capAtWordBoundary(promptText, 1800, model)
    let resolvedModel = model
    const input: Record<string, unknown> = {
        prompt: capped,
        aspect_ratio: ctx.aspectRatio,
        resolution: '2K',
        nsfw_checker: !!ctx.safeMode,
    }

    if (ctx.referenceImage) {
        try {
            const {
                extras: fluxExtras,
                clauses: fluxClauses,
                hasBody: fluxHasBody,
                hasClone: fluxHasClone,
            } = planExtraRefs(
                ctx.referenceImages,
                7,
                ctx.deepfakeMode,
                ctx.cloneWeight,
            )
            const urls: string[] = [
                await ctx.uploadRef(
                    ctx.referenceImage.base64,
                    ctx.referenceImage.mimeType,
                ),
            ]
            for (const r of fluxExtras) {
                urls.push(await ctx.uploadRef(r.base64, r.mimeType))
            }
            resolvedModel = model.replace('text-to-image', 'image-to-image')
            input.input_urls = urls
            const fluxBodyClause = ctx.deepfakeMode
                ? ''
                : fluxHasBody
                  ? ` The SECOND attached image shows her real BODY — replicate its exact body shape, proportions, curves and build; do NOT take the body from the first image. IGNORE the second image's clothing, pose, scene, lighting and background — her outfit, pose and the scene come ONLY from ${fluxHasClone ? 'the CLONE image and the text description' : 'the text description'}.`
                  : ''
            if (fluxHasClone) {
                input.prompt = String(input.prompt)
                    .replace(/\[CLONE:[^\]]*\]/gi, ' ')
                    .replace(/\s{2,}/g, ' ')
                    .trim()
            }
            input.prompt = `The person in the FIRST attached image is the subject — keep her EXACT face, facial features and likeness from that image.${faceFidelityClause}${fluxBodyClause}${hairClause}${eyeClause}${fluxClauses}${INTACT_BODY_CLAUSE} Follow the SCENE, POSE and ACTION described below EXACTLY. ${input.prompt}`
            console.log(
                `[KIE] FLUX.2 i2i with ${urls.length} ref(s) (roles: face${fluxExtras.length > 0 ? ', ' + fluxExtras.map((r) => r.role).join(', ') : ''})`,
            )
        } catch (e) {
            console.warn('[KIE] ref upload failed, staying text-only:', e)
        }
    }

    return { model: resolvedModel, input, fullApiPrompt: promptText }
}

export const flux2Route: ImageRoute = {
    label: 'flux-2',
    matches: (m) => m.startsWith('flux-2/'),
    isPermissive: true,
    build,
}
