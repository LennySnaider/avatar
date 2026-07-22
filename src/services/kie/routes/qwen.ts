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
} from '../shared'

async function build(ctx: ImageRouteContext): Promise<KieImageRequest> {
    // PRESUPUESTO DURO 800 chars (API qwen2/image-edit). Qwen EDITA la imagen de
    // la cara → la identidad (cara/pelo/ojos) ya viaja EN la imagen, así que el
    // ancla de identidad va COMPACTA: el prefijo verboso (FACE FIDELITY + hair
    // RECOLOR + eye) medía ~470 chars y con la POSE relocada se comía los 800
    // → el OUTFIT y el FONDO se decapitaban (reporte: Qwen salía desnuda y sin
    // fondo con el crop top/pink skirt EN el prompt pero cortados). Ancla corta
    // = presupuesto para la escena (ropa+pose+fondo), que es lo que el usuario ve.

    // Override de pelo AUTORITATIVO: Qwen es un editor literal que stripea
    // [BODY:]/[FACE:] (bodyInAnchor=true) → perdía el color de pelo del avatar
    // y seguía el "golden blonde" de la escena. Como el clause NO va en los
    // tags stripeados sino en el ancla, sobrevive y recolorea. hairEmphasis solo
    // se puebla en GENERACIÓN (no en EDIT, donde el usuario recolorea a mano).
    const hairClause = buildHairClause(ctx.hairEmphasis)

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
    if (ctx.negativePrompt) {
        input.negative_prompt = ctx.negativePrompt
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
                    const fidelity =
                        cw >= 75
                            ? `Keep EVERYTHING else EXACTLY as the FIRST image — the SAME outfit (all garment pieces, NO restyling or merging into a one-piece), pose, framing and FULL background/setting (NOT a plain, white or studio backdrop)`
                            : cw >= 50
                              ? `Keep the outfit, pose, framing and background close to the FIRST image (NOT a plain backdrop), minor natural variation allowed`
                              : cw >= 25
                                ? `Use the FIRST image as a general BASIS for outfit, pose and setting, reinterpreting the details freely`
                                : `Take only LOOSE inspiration from the FIRST image (vibe, outfit style, kind of setting)`
                    // Qwen sigue MUY bien el texto (por eso pintaba "LOGO") pero
                    // REESTILIZA si depende solo de la imagen del clone. Se le pasa
                    // la descripción del [CLONE:] como TEXTO (outfit por piezas +
                    // fondo) además de la imagen. Del prompt ORIGINAL (sin la POSE
                    // relocada, para ahorrar presupuesto) y sin corchetes (Qwen los
                    // renderiza literales). El face-swap va al FRENTE (sobrevive el
                    // cap 800); la cola de la descripción es la que cede.
                    const cloneMatch = String(ctx.prompt).match(
                        /\[CLONE:\s*([^\]]*)\]/i,
                    )
                    const cloneDesc = (
                        cloneMatch
                            ? cloneMatch[1]
                            : String(input.prompt).replace(/\[[^\]]*\]/g, ' ')
                    )
                        .replace(/\s{2,}/g, ' ')
                        .trim()
                    input.prompt = `Swap ONLY the face — use the SECOND image's face (exact features, freckles, likeness), keep that person's hair and natural eye colour, NEVER the first image's original face.${hairClause} ${fidelity}: ${cloneDesc}`
                    console.log(
                        `[KIE] qwen2/image-edit CLONE (clone canvas + face swap, weight ${cw})`,
                    )
                } else if (qwenAssets.length > 0) {
                    const qwenUrls: string[] = [refUrl]
                    for (const a of qwenAssets) {
                        qwenUrls.push(await ctx.uploadRef(a.base64, a.mimeType))
                    }
                    input.image_url = qwenUrls
                    // OJO: Qwen 2.0 tiene "structured text rendering" (renderiza
                    // el texto que ve en el prompt). La cláusula vieja repetía la
                    // palabra "LOGO" en mayúsculas y hasta entre comillas ("never
                    // write LOGO") → Qwen la PINTABA literal en la prenda. Aquí NO
                    // aparece esa palabra: se describe el asset como diseño/estampado
                    // y se prohíbe inventar texto SIN nombrarlo.
                    const assetLines = qwenAssets
                        .map(
                            (_, i) =>
                                `The attached image ${i + 2} is a graphic design to reproduce as a PRINT on the fabric of her outfit: copy its EXACT shapes, patterns and colors, sized and placed naturally on the garment. Do NOT paste it as a floating sticker over the scene.`,
                        )
                        .join(' ')
                    input.prompt = `The FIRST image is the person — keep her EXACT face, hair and natural, matte eye colour, unchanged.${hairClause} ${assetLines} Do NOT add any lettering, words, captions or watermarks of your own anywhere in the image — the ONLY artwork on the outfit is the attached design itself. ${input.prompt}`
                    console.log(
                        `[KIE] qwen2/image-edit with ${qwenUrls.length} imgs (face + ${qwenAssets.length} asset)`,
                    )
                } else {
                    input.image_url = refUrl
                    input.prompt = `Keep her EXACT face, hair and natural realistic eyes from the reference image.${hairClause} ${input.prompt}`
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
