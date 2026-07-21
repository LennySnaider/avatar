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
            // FIX "cabeza grande" (raíz ARQUITECTÓNICA, no prosa — el texto falló
            // 2×): Wan 2.7 con imágenes es un FUSOR sobre lienzo, no re-sintetiza la
            // persona como Seedream/Qwen. Hereda la proporción de la imagen 1.
            // REORDEN SOLO cuando el clon NO se pudo enmascarar (cara rival presente):
            //  - clon ENMASCARADO (sin cara rival, caso común bikini/moda) → orden
            //    NORMAL (cara=img1): Wan renderiza natural, sin cabezón y sin look
            //    "pegado" (era el estado perfecto confirmado por el usuario).
            //  - clon SIN enmascarar (explícito, Gemini refusó la detección) → la
            //    cara rival en img1 hace que Wan salga cabezón → se reordena: clon
            //    full-body de img1 (LIENZO que fija la escala cabeza↔cuerpo) + cara
            //    de img2 (identidad). Acepta un face-swap algo "pegado" a cambio de
            //    matar el cabezón, SOLO en el caso que no se puede enmascarar.
            // No hay knob de API de peso de cara (confirmado vs OpenAPI). Cláusulas
            // Wan-específicas re-indexadas — shared.ts (planExtraRefs) es cross-model
            // y NO se toca. Deepfake NO reordena (reproduce la foto entera + swap).
            const cloneRef =
                wanHasClone && !ctx.deepfakeMode
                    ? wanExtras.find(
                          (r) => r.role === 'clone' && !r.masked,
                      )
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
                // Fuerza del clon (imagen 1) por tramo del slider (cloneWeight).
                const cw = ctx.cloneWeight ?? 100
                const cloneCanvasClause =
                    cw >= 75
                        ? `The FIRST attached image is the SCENE to recreate: reproduce its EXACT pose, body position, outfit, hands, objects held, framing, camera angle, lighting and setting, keeping the body's own natural head-to-body proportions. Its person is a FACELESS MANNEQUIN — do NOT take her face from this image; keep her FULLY dressed as shown, do NOT remove or reduce clothing. REMOVE overlaid stickers/watermarks/emojis.`
                        : cw >= 50
                          ? `The FIRST attached image is a STRONG reference: follow its outfit, pose, framing and setting closely (natural variation allowed), keeping the body's own natural head-to-body proportions. Its person is a FACELESS MANNEQUIN — do NOT take her face from it; keep her fully dressed. REMOVE overlaid stickers/watermarks/emojis.`
                          : cw >= 25
                            ? `The FIRST attached image is a MODERATE reference: keep its overall outfit style, general pose and setting at natural body proportions, but reinterpret the exact details and framing. Its person is a FACELESS MANNEQUIN — do NOT take her face from it; keep her dressed.`
                            : `The FIRST attached image is a LOOSE style reference: take only its general vibe, outfit style and setting at natural body proportions; reinterpret pose, framing and details. Its person is a FACELESS MANNEQUIN — do NOT take her face from it.`
                // La cara va de imagen 2 → integrada a escala natural del cuerpo.
                const faceIdentityClause = ` The SECOND attached image is the SUBJECT'S FACE: give the person THIS exact face, facial features and likeness, rendered at natural scale and proportion for the body (a head that fits the shoulders and torso, not oversized).${faceFidelityClause}`
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
                wanAnchor = `${cloneCanvasClause}${faceIdentityClause}${hairClause}${eyeClause}${bodyTextClause}${otherClauses ? ' ' + otherClauses : ''} Render EXACTLY ONE person in ONE natural pose. Follow the SCENE, POSE and ACTION described below EXACTLY.`
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
                      ? ` The SECOND attached image shows her real BODY — replicate its exact body shape, proportions, curves and build; do NOT take the body from the first image. IGNORE the second image's clothing, pose, scene, lighting and background — her outfit, pose and the scene come ONLY from ${wanHasClone ? 'the CLONE image and the text description' : 'the text description'}.`
                      : ctx.bodyEmphasis
                        ? ` Use the reference image ONLY for the face and identity — do NOT copy the body proportions from it: the person in the photo looks SLIMMER than the character really is. Her real body is: ${ctx.bodyEmphasis}. Her hips, glutes and thighs must be visibly FULLER and WIDER than in the reference photo — the narrow waist makes the hip curve obvious. Keep the bust true to the spec: do NOT inflate the chest or add overall body mass beyond it.`
                        : ''
                wanAnchor = `The person in the FIRST attached reference image is the subject — keep her EXACT face, facial features and likeness from that image.${faceFidelityClause}${wanBodyClause}${hairClause}${eyeClause}${wanExtraClauses} Follow the SCENE, POSE and ACTION described below EXACTLY.`
                logRoles = `face${wanExtras.length > 0 ? ', ' + wanExtras.map((r) => r.role).join(', ') : ''}`
            }
            input.input_urls = wanUrls
            const wanSceneRoom = Math.max(250, 2750 - wanAnchor.length)
            let wanSceneText = String(input.prompt)
            if (wanHasClone) {
                // CONSERVA la descripción del clon (verificado por repro: sin ella
                // el prompt de Wan NO menciona la tiara → Wan la pierde, mientras
                // Seedream/Qwen que SÍ la conservan la muestran). Solo se quitan
                // los corchetes/label para que lea como prosa. (Mi revert previo
                // fue prematuro: le quité justo lo que reancla los accesorios.)
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
