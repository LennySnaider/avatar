/**
 * Ruta Qwen Image 2.0 (Alibaba) → `qwen2/image-edit` — editor de imagen literal.
 *
 * Aislada. NO usa `planExtraRefs` ni eyeClause (editor literal: los ojos ya
 * vienen en la foto). `image_size` = RATIO directo (obligatorio). Tres sub-paths
 * i2i: DEEPFAKE (canvas+cara), ASSETS (cara + hasta 2 logos con anti-blend), y
 * plano (solo cara). Otros roles (body/pose/scene) NO se envían (los funde en la
 * escena). Reproduce exactamente lo que hacía legacy para 'qwen*'.
 */

import type { ImageRoute, ImageRouteContext, KieImageRequest } from '../context'
import {
    relocatePoseTag,
    capAtWordBoundary,
    stripIdentityRedundancy,
    hairClause as buildHairClause,
    faceFidelityClause as buildFaceFidelityClause,
} from '../shared'

async function build(ctx: ImageRouteContext): Promise<KieImageRequest> {
    const hairClause = buildHairClause(ctx.hairEmphasis)
    const faceFidelityClause = buildFaceFidelityClause(ctx.identityWeight)

    // Qwen NO es nano → reubica la pose; cap 1800.
    let promptText = relocatePoseTag(ctx.prompt)
    // FIX (Fase 6, verificado A/B live): qwen2/image-edit es un EDITOR LITERAL
    // — el preámbulo + [BODY:] + [FACE:] de texto (identidad ya en la imagen) lo
    // SATURAN y lo descarrilan → ignoraba el [CLONE:] y sacaba un cuerpo/outfit/
    // fondo genéricos (reporte: bodysuit negro en estudio). Se quita TODA la
    // redundancia (bodyInAnchor=true) para que el [CLONE:] domine — con el
    // prompt limpio Qwen clava outfit+escena (verificado: Valeia outfit blanco
    // en baño). Aislado: no toca otras rutas.
    if (ctx.referenceImage) {
        promptText = stripIdentityRedundancy(promptText, true)
    }
    const capped = capAtWordBoundary(promptText, 1800, ctx.model)
    let resolvedModel = ctx.model
    const input: Record<string, unknown> = {
        prompt: capped,
        image_size: ctx.aspectRatio,
        enable_safety_checker: false,
        nsfw_checker: false,
    }

    if (ctx.referenceImage) {
        try {
            const refUrl = await ctx.uploadRef(
                ctx.referenceImage.base64,
                ctx.referenceImage.mimeType,
            )
            resolvedModel = 'qwen2/image-edit'
            input.image_size = ctx.aspectRatio
            const qwenDeepfakeCanvas = ctx.deepfakeMode
                ? (ctx.referenceImages ?? []).find((r) => r.role === 'clone')
                : undefined
            if (qwenDeepfakeCanvas) {
                const canvasUrl = await ctx.uploadRef(
                    qwenDeepfakeCanvas.base64,
                    qwenDeepfakeCanvas.mimeType,
                )
                input.image_url = [canvasUrl, refUrl]
                input.prompt = `REMOVE any overlaid stickers, watermarks, emojis or UI graphics pasted on the photo — the output must be a clean photograph. The FIRST image is the ORIGINAL photo — reproduce it EXACTLY: same body, build, outfit, pose, hands, framing, lighting, background and setting; do NOT blend the two images. The SECOND image shows the person whose FACE to use. The FACE SWAP is MANDATORY: replace the face in the first image with the face from the second image (exact features, freckles, likeness) — never keep the original face. Do NOT alter or remove any clothing. ${input.prompt}`
                console.log('[KIE] qwen2/image-edit DEEPFAKE (canvas + face)')
            } else {
                const qwenClone = (ctx.referenceImages ?? []).find(
                    (r) => r.role === 'clone',
                )
                const qwenAssets = (ctx.referenceImages ?? [])
                    .filter((r) => r.role === 'asset')
                    .slice(0, 2)
                if (qwenClone) {
                    // Qwen EDITA la primera imagen → el CLONE debe ser el LIENZO
                    // (imagen 1) para adoptar su pose/cuerpo/outfit/escena/fondo;
                    // la cara del avatar va como imagen 2 con FACE-SWAP. Con la
                    // cara como imagen 1 (1er intento), Qwen anclaba la composición
                    // del RETRATO e ignoraba la pose/fondo del clone (reporte: cara
                    // perfecta pero físico/pose/fondo mal). Mismo patrón que el
                    // deepfake de Qwen (que SÍ funciona), escalado por el peso.
                    const cloneUrl = await ctx.uploadRef(
                        qwenClone.base64,
                        qwenClone.mimeType,
                    )
                    input.image_url = [cloneUrl, refUrl]
                    const cw = ctx.cloneWeight ?? 100
                    const reproduce =
                        cw >= 75
                            ? `reproduce the FIRST image EXACTLY: same body, build, curves, outfit, pose, hands, framing, lighting, background and setting`
                            : cw >= 50
                              ? `follow the FIRST image CLOSELY (body, outfit, pose, framing, background), allowing only minor natural variation`
                              : cw >= 25
                                ? `use the FIRST image as a general BASIS (outfit style, general pose and setting) but freely reinterpret the exact details and framing`
                                : `take only LOOSE inspiration from the FIRST image (general vibe and outfit style); freely reinterpret the pose, framing and background`
                    // El texto [CLONE:] es redundante con la imagen → se quita.
                    const scene = String(input.prompt)
                        .replace(/\[CLONE:[^\]]*\]/gi, ' ')
                        .replace(/\s{2,}/g, ' ')
                        .trim()
                    input.prompt = `REMOVE any overlaid stickers, watermarks, emojis or UI graphics — output a clean photograph. The FIRST image is the scene to recreate — ${reproduce}; do NOT blend the two images. The SECOND image shows the person whose FACE to use: the FACE SWAP is MANDATORY — replace the face in the first image with the SECOND image's face (exact features, freckles, likeness), NEVER keep the first image's original face.${faceFidelityClause}${hairClause} Do NOT alter or remove any clothing. ${scene}`
                    console.log(
                        `[KIE] qwen2/image-edit CLONE (clone canvas + face swap, weight ${cw})`,
                    )
                } else if (qwenAssets.length > 0) {
                    const qwenUrls: string[] = [refUrl]
                    for (const a of qwenAssets) {
                        qwenUrls.push(await ctx.uploadRef(a.base64, a.mimeType))
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
        } catch (e) {
            console.warn('[KIE] ref upload failed, staying text-only:', e)
        }
    }

    // Qwen impone prompt ≤ 800 chars (API qwen2/image-edit). El ancla (cara +
    // cláusula de clone) va al FRENTE, así que un recorte cae en la cola de
    // escena, nunca en la identidad.
    input.prompt = capAtWordBoundary(String(input.prompt), 800, resolvedModel)
    return { model: resolvedModel, input, fullApiPrompt: promptText }
}

export const qwenRoute: ImageRoute = {
    label: 'qwen',
    matches: (m) => m.startsWith('qwen'),
    isPermissive: true,
    build,
}
