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
    flattenJsonPromptToProse,
    INTACT_BODY_CLAUSE,
    hairClause as buildHairClause,
    eyeClause as buildEyeClause,
    faceFidelityClause as buildFaceFidelityClause,
} from '../shared'

async function build(ctx: ImageRouteContext): Promise<KieImageRequest> {
    const hairClause = buildHairClause(ctx.hairEmphasis)
    const eyeClause = buildEyeClause(ctx.eyeEmphasis)
    const faceFidelityClause = buildFaceFidelityClause(ctx.identityWeight)

    // Wan NO es nano → reubica la pose; luego strip (es seedream/wan) ANTES del cap.
    // JSON→prosa primero: Wan ignora blobs JSON (salida genérica) y cada
    // llave/comilla quema presupuesto de escena.
    let promptText = relocatePoseTag(flattenJsonPromptToProse(ctx.prompt))
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
        nsfw_checker: !!ctx.safeMode,
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
            // CLONE en Wan = método de QWEN (su luz sale PERFECTA, ref del usuario):
            // Wan 2.7 con imágenes es un FUSOR sobre lienzo. Con la cara de img1 salía
            // cabezón + luz mala (importa la luz del face-ref). Fix portado de qwen.ts:
            // clon = imagen 1 (LIENZO, fija escala + APORTA la luz de la escena) + cara
            // = imagen 2, con framing de FACE-SWAP "keep EVERYTHING from image 1, swap
            // ONLY the face, RELIGHT it to the scene". Así la cara se re-ilumina a la
            // luz del lienzo → sin cabezón y sin mismatch. Cláusulas Wan re-indexadas
            // (shared.ts/planExtraRefs es cross-model, NO se toca). Deepfake NO reordena.
            //
            // APPROACH DE QWEN (la luz sale PERFECTA en Qwen, referencia del
            // usuario): clone = imagen 1 (LIENZO) + cara = imagen 2, con framing de
            // FACE-SWAP "keep EVERYTHING from image 1 (incl. su LUZ), swap ONLY the
            // face, RELIGHT it to the scene". Qwen es editor y re-ilumina la cara a
            // la luz del lienzo → cero mismatch. Se aplica a TODO clone (enmascarado
            // o no — el swap reemplaza la cara del lienzo igual). Deepfake NO reordena.
            // cloneWeight decide el ROL ESTRUCTURAL del clon, no solo una frase.
            // ANTES: el clon SIEMPRE era el lienzo (imagen 1) que Wan edita +
            // face-swap fijo ("mantén cuerpo/pelo de imagen 1, cambia solo la
            // cara") → a 15% (LOOSE) seguía saliendo copia casi exacta + swap,
            // porque el peso solo suavizaba UNA frase mientras el andamiaje era
            // invariante. AHORA: canvas-a-editar SOLO en fidelidad alta (cw>=50,
            // EXACT/STRONG). Con cw<50 (MODERATE/LOOSE) cloneRef=undefined → cae
            // al else branch: la cara es imagen 1 (identidad anclada) y el clon
            // viaja como imagen EXTRA con la cláusula tiered de planExtraRefs
            // (shared.ts:115-126 → LOOSE = "faceless mannequin, reinterpret the
            // pose/framing freely"). Deepfake nunca usa este path (ya excluido).
            const cw = ctx.cloneWeight ?? 100
            const cloneRef =
                wanHasClone && !ctx.deepfakeMode && cw >= 50
                    ? wanExtras.find((r) => r.role === 'clone')
                    : undefined

            let wanUrls: string[]
            let wanAnchor: string
            let logRoles: string

            if (cloneRef) {
                // ── REORDEN: [clon = img1 (lienzo/escala), cara = img2 (identidad), ...otros] ──
                const otherExtras = wanExtras.filter(
                    (r) => r.role !== 'clone',
                )
                wanUrls = [
                    await ctx.uploadRef(
                        cloneRef.base64,
                        cloneRef.mimeType,
                    ),
                    await ctx.uploadRef(
                        ctx.referenceImage.base64,
                        ctx.referenceImage.mimeType,
                    ),
                ]
                for (const r of otherExtras) {
                    wanUrls.push(await ctx.uploadRef(r.base64, r.mimeType))
                }
                // Framing FACE-SWAP estilo Qwen (mantener TODO de la imagen 1,
                // incluida su LUZ; cambiar SOLO la cara). Este path SOLO corre en
                // fidelidad alta (cw>=50 garantizado por el gate de cloneRef), así
                // que solo hay 2 tramos: EXACT (>=75) y STRONG (50-74). Los tramos
                // MODERATE/LOOSE ya NO llegan aquí (caen al else branch como extra).
                const cloneCanvasClause =
                    cw >= 75
                        ? `The FIRST attached image is the original photo — keep it EXACTLY: the same body, build, outfit (every garment piece, NO restyling or merging), pose, hands, objects held, framing, camera angle, background, setting AND its lighting, shadows and colour. Do NOT redraw or re-imagine the scene; only edit the face. Keep her FULLY dressed as shown. REMOVE overlaid stickers/watermarks/emojis.`
                        : `The FIRST attached image is the original photo — keep its outfit, pose, hands, framing, background, setting AND lighting close to it (minor natural variation allowed); only edit the face. REMOVE overlaid stickers/watermarks/emojis.`
                // Swap SOLO la cara desde imagen 2 + RELIGHT a la luz del lienzo.
                const faceIdentityClause = ` Swap ONLY the FACE: give her the SECOND attached image's face — exact features, bone structure, freckles, eye colour and likeness — NEVER the first image's original face. Keep her hair and body as in the first image, with her head at natural head-to-body proportion (a head that fits the shoulders and torso, not oversized).${faceFidelityClause} RELIGHT the swapped face to match the FIRST image's OWN light: the same direction, colour temperature, brightness and shadows as the scene casts on her — if her head is turned away from the light source, her face is correspondingly shadowed — so the face looks naturally photographed in that scene, not lit separately.`
                const bodyTextClause =
                    !wanHasBody && ctx.bodyEmphasis
                        ? ` Her real body is: ${ctx.bodyEmphasis}. Render her hips, glutes and thighs visibly fuller than a slim reference; keep the bust true to the spec, do NOT inflate the chest.`
                        : ''
                // Cláusulas de los extras restantes (body/asset/…), RE-INDEXADAS
                // desde imagen 3 (clon=1, cara=2). Verbatim funcional de shared,
                // duplicado a propósito porque shared asume cara=imagen 1.
                const otherClauses = otherExtras
                    .map((r, i) => {
                        const n = i + 3
                        switch (r.role) {
                            case 'body':
                                return `Image ${n} shows her real BODY — replicate its exact body shape, proportions, curves and build; IGNORE its clothing, pose, scene, lighting and background.`
                            case 'bust':
                                return `Image ${n} = her real BUST: copy ONLY its size, shape and fullness. IGNORE that image's clothing/nudity, pose, scene and lighting.`
                            case 'glutes':
                                return `Image ${n} = her real GLUTES and hips: copy ONLY their size, shape, fullness and projection. IGNORE that image's clothing/nudity, pose, scene and lighting.`
                            case 'asset':
                                return `Image ${n} = product ASSET. If a garment/accessory: dress her in this EXACT item. If a logo/graphic: print it faithfully ONLY where the scene text places it; NEVER add other logos, brand names or placeholder text.`
                            case 'pose':
                                return `Image ${n} = POSE reference: copy ONLY the body position — not its face, proportions or clothing.`
                            case 'scene':
                                return `Image ${n} = STYLE/SCENE reference: use for setting, lighting and composition; REPLACE its subject with her.`
                            case 'place':
                                return `Image ${n} = the LOCATION: place her in THIS exact environment; IGNORE any person in it.`
                            default:
                                return ''
                        }
                    })
                    .filter(Boolean)
                    .join(' ')
                wanAnchor = `${cloneCanvasClause}${faceIdentityClause}${hairClause}${eyeClause}${bodyTextClause}${otherClauses ? ' ' + otherClauses : ''} Render EXACTLY ONE person in ONE natural pose.${INTACT_BODY_CLAUSE} Follow the SCENE, POSE and ACTION described below EXACTLY.`
                logRoles = `clone(img1), face(img2)${otherExtras.length > 0 ? ', ' + otherExtras.map((r) => r.role).join(', ') : ''}`
            } else {
                // ── Sin clone (o deepfake): cara = imagen 1 (byte-idéntico a antes) ──
                wanUrls = [
                    await ctx.uploadRef(
                        ctx.referenceImage.base64,
                        ctx.referenceImage.mimeType,
                    ),
                ]
                for (const r of wanExtras) {
                    wanUrls.push(await ctx.uploadRef(r.base64, r.mimeType))
                }
                const wanBodyClause = ctx.deepfakeMode
                    ? ''
                    : wanHasBody
                      ? ` The SECOND attached image shows her real BODY (a turnaround sheet: the SAME one woman from several angles) — replicate its exact body shape, proportions, curves and build; do NOT take the body from the first image. IGNORE the second image's clothing, pose, scene, lighting and background — her outfit, pose and the scene come ONLY from ${wanHasClone ? 'the CLONE image and the text description' : 'the text description'}.${
                            // Spec en TEXTO también con body ref (mismo hueco
                            // que seedream, 2026-07-22) — con la calibración
                            // DIRECCIONAL de Wan (6c97342): caderas/glúteos/
                            // muslos llenos, busto fiel sin inflar.
                            ctx.bodyEmphasis
                                ? ` Her exact body spec: ${ctx.bodyEmphasis} — render THAT body matching the second image: hips, glutes and thighs visibly FULL and WIDE as specified; keep the bust true to the spec, do NOT inflate the chest.`
                                : ''
                        }`
                      : ctx.bodyEmphasis
                        ? ` Use the reference image ONLY for the face and identity — do NOT copy the body proportions from it: the person in the photo looks SLIMMER than the character really is. Her real body is: ${ctx.bodyEmphasis}. Her hips, glutes and thighs must be visibly FULLER and WIDER than in the reference photo — the narrow waist makes the hip curve obvious. Keep the bust true to the spec: do NOT inflate the chest or add overall body mass beyond it.`
                        : ''
                wanAnchor = `The person in the FIRST attached reference image is the subject — keep her EXACT face, facial features and likeness from that image.${faceFidelityClause}${wanBodyClause}${hairClause}${eyeClause}${wanExtraClauses}${INTACT_BODY_CLAUSE} Follow the SCENE, POSE and ACTION described below EXACTLY.`
                logRoles = `face${wanExtras.length > 0 ? ', ' + wanExtras.map((r) => r.role).join(', ') : ''}`
            }
            input.input_urls = wanUrls
            const wanSceneRoom = Math.max(250, 2750 - wanAnchor.length)
            let wanSceneText = String(input.prompt)
            if (wanHasClone && cw >= 50) {
                // canvas mode (cw>=50): CONSERVA la descripción del clon (verificado
                // por repro: sin ella el prompt de Wan NO menciona la tiara → Wan la
                // pierde, mientras Seedream/Qwen que SÍ la conservan la muestran).
                // Solo se quitan los corchetes/label para que lea como prosa.
                wanSceneText = wanSceneText
                    .replace(/\[CLONE:\s*/gi, '')
                    .replace(/\]/g, ' ')
                    .replace(/\s{2,}/g, ' ')
                    .trim()
            } else if (wanHasClone) {
                // MODERATE/LOOSE (cw<50): el clon es una referencia SUELTA (imagen
                // extra con cláusula tiered). Re-inyectar su outfit/accesorios
                // EXACTOS reimpondría la copia que el peso bajo quiere evitar, así
                // que se ELIMINA el bloque [CLONE:...] completo del texto de escena.
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
                `[KIE] Wan 2.7 Image with ${wanUrls.length} ref(s) via input_urls (roles: ${logRoles}${hairClause ? ' + hair override' : ''})`,
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
