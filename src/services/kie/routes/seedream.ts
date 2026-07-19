/**
 * Ruta Seedream 4.5 / 5 (ByteDance) — i2i PERMISIVO, hasta 10 imágenes.
 *
 * Aislada. Reubica la pose, corre stripIdentityRedundancy, `planExtraRefs(_, 9)`,
 * two-way anchor (cara imagen 1 + cuerpo por bodyEmphasis/Body Ref), curveBoost
 * por-ratio, y presupuesto de escena anchor-aware (2750 − ancla). Quality 'high'
 * en 5-lite (misma cara, mismo precio) / 'basic' en el resto. Reproduce
 * exactamente lo que hacía legacy para 'seedream/*'.
 *
 * NOTA (pendiente Fase 6): recuperar el fondo de calle (Lite/Pro salían en
 * estudio). El fix va AQUÍ, aislado (revisar curveBoost/sceneRoom/strip).
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
    const model = ctx.model

    // Seedream NO es nano → reubica la pose; luego strip ANTES del cap 2400.
    let promptText = relocatePoseTag(ctx.prompt)
    if (ctx.referenceImage) {
        promptText = stripIdentityRedundancy(
            promptText,
            Boolean(ctx.deepfakeMode) ||
                Boolean(ctx.bodyEmphasis) ||
                (ctx.referenceImages ?? []).some((r) => r.role === 'body'),
        )
    }
    const capped = capAtWordBoundary(promptText, 2400, model)
    let resolvedModel = model
    const input: Record<string, unknown> = {
        prompt: capped,
        aspect_ratio: ctx.aspectRatio,
        quality: model.startsWith('seedream/5-lite') ? 'high' : 'basic',
        nsfw_checker: false,
    }

    if (ctx.referenceImage) {
        try {
            const {
                extras,
                clauses: extraClauses,
                hasBody,
                hasClone,
            } = planExtraRefs(
                ctx.referenceImages,
                9,
                ctx.deepfakeMode,
                ctx.cloneWeight,
            )
            const urls: string[] = [
                await ctx.uploadRef(
                    ctx.referenceImage.base64,
                    ctx.referenceImage.mimeType,
                ),
            ]
            for (const r of extras) {
                urls.push(await ctx.uploadRef(r.base64, r.mimeType))
            }
            resolvedModel =
                model === 'seedream/4.5-text-to-image'
                    ? 'seedream/4.5-edit'
                    : model.replace('text-to-image', 'image-to-image')
            input.image_urls = urls
            const bodyClause = ctx.deepfakeMode
                ? ''
                : hasBody
                  ? `The SECOND attached image shows her real BODY — replicate its exact body shape, proportions, curves and build; do NOT take the body from the first image. IGNORE the second image's clothing, pose, scene, lighting and background — her outfit, pose and the scene come ONLY from ${hasClone ? 'the CLONE image and the text description' : 'the text description'}.`
                  : `Use the reference image ONLY for the face and identity: do NOT copy the body, build, weight or proportions from it — the person in the photo may look slimmer than she really is.${
                        ctx.curveBoost ? ` ${ctx.curveBoost}` : ''
                    }${
                        ctx.bodyEmphasis
                            ? ` Her real body is: ${ctx.bodyEmphasis}. Render THAT body, visibly fuller and curvier than the reference photo suggests.`
                            : ' Her body proportions MUST follow the text description below exactly (bust, waist, hips and thighs as written).'
                    }`
            // FASE 6 — el FONDO/lugar viven al FINAL de la escena y se
            // decapitaban: el ancla crecía (bodyClause = base + curveBoost +
            // bodyEmphasis largo + hair/eye) y se comía el presupuesto, así que
            // la escena se cortaba justo tras el outfit, ANTES del fondo (medido
            // live: prompt 2648 → escena cortada en "...sunglasses with", sin
            // "panelled wall / silver-toned fixture" → Lite/Pro salían en
            // estudio). El clone lo tapaba porque la IMAGEN lleva la escena;
            // sin clone, el texto del fondo debe sobrevivir. Fix: reservar un
            // PISO duro para la escena y, si el ancla no cabe en el resto,
            // recortar el bodyClause (la parte redundante — la identidad física
            // ya viaja en la imagen 1 + curveBoost), NUNCA la escena. Sin
            // recorte el ancla es byte-idéntica a antes.
            const SEEDREAM_BUDGET = 2750
            const SCENE_FLOOR = 1300
            const anchorHead = `The person in the FIRST attached reference image is the subject — keep her EXACT face, facial features and likeness from that image.${faceFidelityClause} `
            const anchorTail = `${hairClause}${eyeClause}${extraClauses} Follow the SCENE, POSE and ACTION described below EXACTLY.`
            const bodyClauseMax =
                SEEDREAM_BUDGET -
                SCENE_FLOOR -
                anchorHead.length -
                anchorTail.length
            const fitBodyClause =
                bodyClauseMax > 0 && bodyClause.length > bodyClauseMax
                    ? capAtWordBoundary(bodyClause, bodyClauseMax, model)
                    : bodyClause
            const seedreamAnchor = `${anchorHead}${fitBodyClause}${anchorTail}`
            const sceneRoom = Math.max(
                SCENE_FLOOR,
                SEEDREAM_BUDGET - seedreamAnchor.length,
            )
            let sceneText = String(input.prompt)
            if (hasClone) {
                sceneText = sceneText
                    .replace(/\[CLONE:[^\]]*\]/gi, ' ')
                    .replace(/\s{2,}/g, ' ')
                    .trim()
            }
            if (sceneText.length > sceneRoom) {
                sceneText = sceneText.slice(0, sceneRoom)
                const sp = sceneText.lastIndexOf(' ')
                if (sp > sceneRoom * 0.85) sceneText = sceneText.slice(0, sp)
                console.warn(
                    `[KIE] Seedream scene re-capped to ${sceneText.length} chars (anchor ${seedreamAnchor.length})`,
                )
            }
            if (seedreamAnchor.length > 2400) {
                console.warn(
                    `[KIE] Seedream anchor GRANDE (${seedreamAnchor.length} chars) — riesgo de rebasar el límite del modelo`,
                )
            }
            input.prompt = `${seedreamAnchor} ${sceneText}`
            console.log(
                `[KIE] Seedream i2i (${resolvedModel}) with ${urls.length} ref(s) (roles: face${extras.length > 0 ? ', ' + extras.map((r) => r.role).join(', ') : ''}${hairClause ? ' + hair override' : ''})`,
            )
        } catch (e) {
            console.warn('[KIE] ref upload failed, staying text-only:', e)
        }
    }

    return { model: resolvedModel, input, fullApiPrompt: promptText }
}

export const seedreamRoute: ImageRoute = {
    label: 'seedream',
    matches: (m) => m.startsWith('seedream/'),
    isPermissive: true,
    build,
}
