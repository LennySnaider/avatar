/**
 * Ruta Wan 2.7 Image (Alibaba) — i2i/edit PERMISIVO, sin censura upstream.
 *
 * Aislada. Reubica la pose, corre stripIdentityRedundancy (el ancla ya carga
 * la identidad), `planExtraRefs(_, 8)` para hasta 9 input_urls, y presupuesto
 * de escena anchor-aware (2750 − ancla). n=1 OBLIGATORIO (sin él cobra 4×).
 * Reproduce exactamente lo que hacía legacy para 'wan/2-7-image'.
 */

import type { ImageRoute, ImageRouteContext, KieImageRequest } from '../context'
import {
    planExtraRefs,
    stripIdentityRedundancy,
    relocatePoseTag,
    capAtWordBoundary,
    hairClause as buildHairClause,
    eyeClause as buildEyeClause,
    faceFidelityClause as buildFaceFidelityClause,
} from '../shared'

async function build(ctx: ImageRouteContext): Promise<KieImageRequest> {
    const hairClause = buildHairClause(ctx.hairEmphasis)
    const eyeClause = buildEyeClause(ctx.eyeEmphasis)
    const faceFidelityClause = buildFaceFidelityClause(ctx.identityWeight)

    // Wan NO es nano → reubica la pose; luego strip (es seedream/wan) ANTES del cap.
    let promptText = relocatePoseTag(ctx.prompt)
    if (ctx.referenceImage) {
        promptText = stripIdentityRedundancy(
            promptText,
            Boolean(ctx.deepfakeMode) ||
                Boolean(ctx.bodyEmphasis) ||
                (ctx.referenceImages ?? []).some((r) => r.role === 'body'),
        )
    }
    const capped = capAtWordBoundary(promptText, 1800, ctx.model)
    const input: Record<string, unknown> = {
        prompt: capped,
        aspect_ratio: ctx.aspectRatio,
        resolution: '2K',
        n: 1,
        nsfw_checker: false,
    }

    if (ctx.referenceImage) {
        try {
            const {
                extras: wanExtras,
                clauses: wanExtraClauses,
                hasBody: wanHasBody,
                hasClone: wanHasClone,
            } = planExtraRefs(
                ctx.referenceImages,
                8,
                ctx.deepfakeMode,
                ctx.cloneWeight,
            )
            const wanUrls: string[] = [
                await ctx.uploadRef(
                    ctx.referenceImage.base64,
                    ctx.referenceImage.mimeType,
                ),
            ]
            for (const r of wanExtras) {
                wanUrls.push(await ctx.uploadRef(r.base64, r.mimeType))
            }
            input.input_urls = wanUrls
            const wanBodyClause = ctx.deepfakeMode
                ? ''
                : wanHasBody
                  ? ` The SECOND attached image shows her real BODY — replicate its exact body shape, proportions, curves and build; do NOT take the body from the first image. IGNORE the second image's clothing, pose, scene, lighting and background — her outfit, pose and the scene come ONLY from ${wanHasClone ? 'the CLONE image and the text description' : 'the text description'}.`
                  : ctx.bodyEmphasis
                    ? ` Use the reference image ONLY for the face and identity — do NOT copy the body proportions from it: the person in the photo looks SLIMMER than the character really is. Her real body is: ${ctx.bodyEmphasis}. Her hips, glutes and thighs must be visibly FULLER and WIDER than in the reference photo — the narrow waist makes the hip curve obvious. Keep the bust true to the spec: do NOT inflate the chest or add overall body mass beyond it.`
                    : ''
            const wanAnchor = `The person in the FIRST attached reference image is the subject — keep her EXACT face, facial features and likeness from that image.${faceFidelityClause}${wanBodyClause}${hairClause}${eyeClause}${wanExtraClauses} Follow the SCENE, POSE and ACTION described below EXACTLY.`
            const wanSceneRoom = Math.max(250, 2750 - wanAnchor.length)
            let wanSceneText = String(input.prompt)
            if (wanHasClone) {
                // Se CONSERVA la descripción del clon (antes se borraba) para
                // REANCLAR accesorios finos (tiara, collar) que Wan "limpia" si
                // solo van en la imagen. Solo se quitan los corchetes/label.
                wanSceneText = wanSceneText
                    .replace(/\[CLONE:\s*/gi, '')
                    .replace(/\]/g, ' ')
                    .replace(/\s{2,}/g, ' ')
                    .trim()
            }
            if (wanSceneText.length > wanSceneRoom) {
                wanSceneText = wanSceneText.slice(0, wanSceneRoom)
                const wsp = wanSceneText.lastIndexOf(' ')
                if (wsp > wanSceneRoom * 0.85)
                    wanSceneText = wanSceneText.slice(0, wsp)
                console.warn(
                    `[KIE] Wan scene re-capped to ${wanSceneText.length} chars (anchor ${wanAnchor.length})`,
                )
            }
            input.prompt = `${wanAnchor} ${wanSceneText}`
            console.log(
                `[KIE] Wan 2.7 Image with ${wanUrls.length} ref(s) via input_urls (roles: face${wanExtras.length > 0 ? ', ' + wanExtras.map((r) => r.role).join(', ') : ''}${wanBodyClause && !wanHasBody ? ' + body-text anchor' : ''}${hairClause ? ' + hair override' : ''})`,
            )
        } catch (e) {
            console.warn('[KIE] ref upload failed, staying text-only:', e)
        }
    }

    return { model: ctx.model, input, fullApiPrompt: promptText }
}

export const wanRoute: ImageRoute = {
    label: 'wan',
    matches: (m) => m === 'wan/2-7-image',
    isPermissive: true,
    build,
}
