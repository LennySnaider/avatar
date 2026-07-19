/**
 * Ruta LEGACY — el build genérico ACTUAL de `generateImageKie` extraído
 * VERBATIM a una función pura (salvo `ctx.uploadRef`/`ctx.cropToAspect`).
 *
 * Es el fallback del despachador para cualquier modelo aún no migrado a su
 * ruta propia, y el BASELINE contra el que se verifican las rutas nuevas: el
 * snapshot exige que la ruta de cada modelo reproduzca el `{model, input}` de
 * ESTA función byte-a-byte antes de reemplazarla.
 *
 * NO incluye el submit ni la escalera de moderación (eso vive en `ladder.ts`);
 * solo construye el request. Los adaptadores dedicados (flux-kontext, gpt-4o,
 * nano-banana-pro, gpt-image-2) NO pasan por aquí — el despachador los deja en
 * KieService tal cual.
 */

import type { ImageRouteContext, KieImageRequest } from '../context'
import {
    planExtraRefs,
    stripIdentityRedundancy,
    relocatePoseTag,
    capAtWordBoundary,
    aspectToImageSize,
    resolveModelAlias,
    hairClause as buildHairClause,
    eyeClause as buildEyeClause,
    faceFidelityClause as buildFaceFidelityClause,
} from '../shared'

/** Construye el request genérico de KIE (verbatim de KieService 504-963). */
export async function buildLegacyRequest(
    ctx: ImageRouteContext,
): Promise<KieImageRequest> {
    const {
        model,
        aspectRatio,
        referenceImage,
        referenceImages,
        bodyEmphasis,
        eyeEmphasis,
        hairEmphasis,
        identityWeight,
        deepfakeMode,
        curveBoost,
        cloneWeight,
        uploadRef,
        cropToAspect,
    } = ctx

    const hairClause = buildHairClause(hairEmphasis)
    const eyeClause = buildEyeClause(eyeEmphasis)
    const faceFidelityClause = buildFaceFidelityClause(identityWeight)

    let promptText = ctx.prompt

    // ── Prelude compartido (KieService 519-569) ────────────────────────────
    let resolvedModel = resolveModelAlias(model)
    const promptCap = model.startsWith('nano-banana-2')
        ? 19000
        : model === 'z-image'
          ? 1500
          : model.startsWith('seedream/')
            ? 2400
            : 1800
    // Reubicación de pose al frente — EXCEPTO la familia nano-banana-2.
    if (!model.startsWith('nano-banana-2')) {
        promptText = relocatePoseTag(promptText)
    }
    // Seedream/Wan i2i: quitar redundancia de identidad ANTES del cap genérico.
    if (
        referenceImage &&
        (model.startsWith('seedream/') || model === 'wan/2-7-image')
    ) {
        promptText = stripIdentityRedundancy(
            promptText,
            Boolean(deepfakeMode) ||
                Boolean(bodyEmphasis) ||
                (referenceImages ?? []).some((r) => r.role === 'body'),
        )
    }
    const capped = capAtWordBoundary(promptText, promptCap, model)
    const input: Record<string, unknown> = { prompt: capped }
    const asImageSize = () => aspectToImageSize(aspectRatio)

    // ── Params t2i por familia (KieService 586-642) ────────────────────────
    if (model.startsWith('seedream/')) {
        input.aspect_ratio = aspectRatio
        input.quality = model.startsWith('seedream/5-lite') ? 'high' : 'basic'
        input.nsfw_checker = false
    } else if (model.startsWith('flux-2/')) {
        input.aspect_ratio = aspectRatio
        input.resolution = '2K'
        input.nsfw_checker = false
    } else if (model === 'z-image') {
        input.aspect_ratio = aspectRatio
        input.nsfw_checker = false
    } else if (model.startsWith('qwen')) {
        input.image_size = aspectRatio
        input.enable_safety_checker = false
        input.nsfw_checker = false
    } else if (model === 'wan/2-7-image') {
        input.aspect_ratio = aspectRatio
        input.resolution = '2K'
        input.n = 1
        input.nsfw_checker = false
    } else if (model.startsWith('ideogram/')) {
        input.image_size = asImageSize()
        input.rendering_speed = 'QUALITY'
    } else if (model.startsWith('nano-banana-2')) {
        input.aspect_ratio = aspectRatio
        input.resolution = model === 'nano-banana-2-lite' ? '1K' : '2K'
    } else if (model === 'grok-imagine/image-to-image') {
        input.nsfw_checker = false
    } else {
        input.aspect_ratio = aspectRatio
        if (referenceImage) {
            resolvedModel = model.replace('/text-to-image', '/image-to-image')
            input.image_url = `data:${referenceImage.mimeType};base64,${referenceImage.base64}`
        }
    }

    // ── i2i identity lock (KieService 648-963) ─────────────────────────────
    if (
        referenceImage &&
        (model.startsWith('flux-2/') ||
            model.startsWith('qwen') ||
            model.startsWith('seedream/') ||
            model.startsWith('nano-banana-2') ||
            model === 'wan/2-7-image' ||
            model === 'grok-imagine/image-to-image')
    ) {
        try {
            if (model === 'grok-imagine/image-to-image') {
                const cropped = await cropToAspect(
                    referenceImage.base64,
                    referenceImage.mimeType,
                    aspectRatio,
                )
                const refUrl = await uploadRef(cropped.base64, cropped.mimeType)
                input.image_urls = [refUrl]
                if (hairClause || faceFidelityClause) {
                    input.prompt = `Keep the EXACT face and likeness of the person in the reference image.${faceFidelityClause}${hairClause} ${input.prompt}`
                }
                console.log(
                    `[KIE] Grok i2i with 1 identity ref (AR-cropped)${hairClause ? ' + hair override' : ''}`,
                )
            } else if (model.startsWith('seedream/')) {
                const {
                    extras,
                    clauses: extraClauses,
                    hasBody,
                    hasClone,
                } = planExtraRefs(referenceImages, 9, deepfakeMode, cloneWeight)
                const urls: string[] = [
                    await uploadRef(
                        referenceImage.base64,
                        referenceImage.mimeType,
                    ),
                ]
                for (const r of extras) {
                    urls.push(await uploadRef(r.base64, r.mimeType))
                }
                resolvedModel =
                    model === 'seedream/4.5-text-to-image'
                        ? 'seedream/4.5-edit'
                        : model.replace('text-to-image', 'image-to-image')
                input.image_urls = urls
                const bodyClause = deepfakeMode
                    ? ''
                    : hasBody
                      ? `The SECOND attached image shows her real BODY — replicate its exact body shape, proportions, curves and build; do NOT take the body from the first image. IGNORE the second image's clothing, pose, scene, lighting and background — her outfit, pose and the scene come ONLY from ${hasClone ? 'the CLONE image and the text description' : 'the text description'}.`
                      : `Use the reference image ONLY for the face and identity: do NOT copy the body, build, weight or proportions from it — the person in the photo may look slimmer than she really is.${
                            curveBoost ? ` ${curveBoost}` : ''
                        }${
                            bodyEmphasis
                                ? ` Her real body is: ${bodyEmphasis}. Render THAT body, visibly fuller and curvier than the reference photo suggests.`
                                : ' Her body proportions MUST follow the text description below exactly (bust, waist, hips and thighs as written).'
                        }`
                const seedreamAnchor = `The person in the FIRST attached reference image is the subject — keep her EXACT face, facial features and likeness from that image.${faceFidelityClause} ${bodyClause}${hairClause}${eyeClause}${extraClauses} Follow the SCENE, POSE and ACTION described below EXACTLY.`
                const sceneRoom = Math.max(250, 2750 - seedreamAnchor.length)
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
                    if (sp > sceneRoom * 0.85)
                        sceneText = sceneText.slice(0, sp)
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
            } else if (model.startsWith('nano-banana-2')) {
                const nbRefs = (
                    referenceImages && referenceImages.length > 0
                        ? referenceImages
                        : [referenceImage]
                ).slice(0, 14)
                const nbUrls: string[] = []
                for (const r of nbRefs) {
                    nbUrls.push(await uploadRef(r.base64, r.mimeType))
                }
                input.image_input = nbUrls
                input.prompt = `The person in the first attached reference image is the subject — keep her EXACT face, facial features and likeness.${hairClause} ${input.prompt}`
                console.log(
                    `[KIE] ${model} with ${nbUrls.length} ref(s) via image_input (roles: ${nbRefs.map((r) => ('role' in r && r.role) || 'face').join(', ')})`,
                )
            } else if (model === 'wan/2-7-image') {
                const {
                    extras: wanExtras,
                    clauses: wanExtraClauses,
                    hasBody: wanHasBody,
                    hasClone: wanHasClone,
                } = planExtraRefs(referenceImages, 8, deepfakeMode, cloneWeight)
                const wanUrls: string[] = [
                    await uploadRef(
                        referenceImage.base64,
                        referenceImage.mimeType,
                    ),
                ]
                for (const r of wanExtras) {
                    wanUrls.push(await uploadRef(r.base64, r.mimeType))
                }
                input.input_urls = wanUrls
                const wanBodyClause = deepfakeMode
                    ? ''
                    : wanHasBody
                      ? ` The SECOND attached image shows her real BODY — replicate its exact body shape, proportions, curves and build; do NOT take the body from the first image. IGNORE the second image's clothing, pose, scene, lighting and background — her outfit, pose and the scene come ONLY from ${wanHasClone ? 'the CLONE image and the text description' : 'the text description'}.`
                      : bodyEmphasis
                        ? ` Use the reference image ONLY for the face and identity — do NOT copy the body proportions from it: the person in the photo looks SLIMMER than the character really is. Her real body is: ${bodyEmphasis}. Her hips, glutes and thighs must be visibly FULLER and WIDER than in the reference photo — the narrow waist makes the hip curve obvious. Keep the bust true to the spec: do NOT inflate the chest or add overall body mass beyond it.`
                        : ''
                const wanAnchor = `The person in the FIRST attached reference image is the subject — keep her EXACT face, facial features and likeness from that image.${faceFidelityClause}${wanBodyClause}${hairClause}${eyeClause}${wanExtraClauses} Follow the SCENE, POSE and ACTION described below EXACTLY.`
                const wanSceneRoom = Math.max(250, 2750 - wanAnchor.length)
                let wanSceneText = String(input.prompt)
                if (wanHasClone) {
                    wanSceneText = wanSceneText
                        .replace(/\[CLONE:[^\]]*\]/gi, ' ')
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
            } else if (model.startsWith('flux-2/')) {
                const {
                    extras: fluxExtras,
                    clauses: fluxClauses,
                    hasBody: fluxHasBody,
                    hasClone: fluxHasClone,
                } = planExtraRefs(referenceImages, 7, deepfakeMode, cloneWeight)
                const urls: string[] = [
                    await uploadRef(
                        referenceImage.base64,
                        referenceImage.mimeType,
                    ),
                ]
                for (const r of fluxExtras) {
                    urls.push(await uploadRef(r.base64, r.mimeType))
                }
                resolvedModel = model.replace('text-to-image', 'image-to-image')
                input.input_urls = urls
                const fluxBodyClause = deepfakeMode
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
                input.prompt = `The person in the FIRST attached image is the subject — keep her EXACT face, facial features and likeness from that image.${faceFidelityClause}${fluxBodyClause}${hairClause}${eyeClause}${fluxClauses} Follow the SCENE, POSE and ACTION described below EXACTLY. ${input.prompt}`
                console.log(
                    `[KIE] FLUX.2 i2i with ${urls.length} ref(s) (roles: face${fluxExtras.length > 0 ? ', ' + fluxExtras.map((r) => r.role).join(', ') : ''})`,
                )
            } else {
                const refUrl = await uploadRef(
                    referenceImage.base64,
                    referenceImage.mimeType,
                )
                resolvedModel = 'qwen2/image-edit'
                input.image_size = aspectRatio
                const qwenDeepfakeCanvas = deepfakeMode
                    ? (referenceImages ?? []).find((r) => r.role === 'clone')
                    : undefined
                if (qwenDeepfakeCanvas) {
                    const canvasUrl = await uploadRef(
                        qwenDeepfakeCanvas.base64,
                        qwenDeepfakeCanvas.mimeType,
                    )
                    input.image_url = [canvasUrl, refUrl]
                    input.prompt = `REMOVE any overlaid stickers, watermarks, emojis or UI graphics pasted on the photo — the output must be a clean photograph. The FIRST image is the ORIGINAL photo — reproduce it EXACTLY: same body, build, outfit, pose, hands, framing, lighting, background and setting; do NOT blend the two images. The SECOND image shows the person whose FACE to use. The FACE SWAP is MANDATORY: replace the face in the first image with the face from the second image (exact features, freckles, likeness) — never keep the original face. Do NOT alter or remove any clothing. ${input.prompt}`
                    console.log(
                        '[KIE] qwen2/image-edit DEEPFAKE (canvas + face)',
                    )
                } else {
                    const qwenAssets = (referenceImages ?? [])
                        .filter((r) => r.role === 'asset')
                        .slice(0, 2)
                    if (qwenAssets.length > 0) {
                        const qwenUrls: string[] = [refUrl]
                        for (const a of qwenAssets) {
                            qwenUrls.push(await uploadRef(a.base64, a.mimeType))
                        }
                        input.image_url = qwenUrls
                        const assetLines = qwenAssets
                            .map(
                                (_, i) =>
                                    `Image ${i + 2} is a LOGO/BRAND GRAPHIC — it is ARTWORK, not a scene element: print this EXACT design on her clothing wherever the outfit shows a logo or graphic, reproducing its shapes and colors faithfully. Do NOT blend or overlay it onto the scene, and never write placeholder text such as "LOGO".`,
                            )
                            .join(' ')
                        input.prompt = `The FIRST image is the person — keep her EXACT face and likeness.${faceFidelityClause}${hairClause} Her eyes keep their exact natural color and iris texture from the reference photo — do NOT recolor, brighten or saturate them. ${assetLines} ${input.prompt}`
                        console.log(
                            `[KIE] qwen2/image-edit with ${qwenUrls.length} imgs (face + ${qwenAssets.length} asset)`,
                        )
                    } else {
                        input.image_url = refUrl
                        input.prompt = `Keep the EXACT face and likeness of the person in the reference image.${faceFidelityClause}${hairClause} Her eyes keep their exact natural color and iris texture from the reference photo — do NOT recolor, brighten or saturate them. ${input.prompt}`
                    }
                }
            }
        } catch (e) {
            console.warn('[KIE] ref upload failed, staying text-only:', e)
        }
    }

    return { model: resolvedModel, input, fullApiPrompt: promptText }
}
