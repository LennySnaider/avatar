/**
 * Ruta Seedream 4.5 / 5 (ByteDance) — i2i PERMISIVO, hasta 10 imágenes.
 *
 * Aislada. Reubica la pose, corre stripIdentityRedundancy, `planExtraRefs(_, 9)`,
 * two-way anchor (cara imagen 1 + cuerpo por bodyEmphasis/Body Ref), curveBoost
 * por-ratio, y presupuesto de escena anchor-aware (2750 − ancla). Quality
 * 'basic' en todos los tiers (Lite basic = 2K desde el re-tiering de KIE; ver
 * nota en el input). Reproduce lo que hacía legacy para 'seedream/*'.
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
        // 'basic' TODOS los tiers (2026-07-22): KIE re-tieró Lite — 'basic' ya
        // es 2K (docs), la resolución del 'high' de Pro que mantiene la cara.
        // El test viejo "basic deforma la cara" (8225cb5) era del tiering
        // anterior; 'high' en Lite = 3K y ~138s/imagen. Si la cara se degrada
        // en vivo, revertir a: model.startsWith('seedream/5-lite') ? 'high'
        // : 'basic'.
        quality: 'basic',
        // output_format se queda en el default PNG. Se probó 'jpeg' por
        // velocidad (2026-07-22) y KIE comprime AGRESIVO: mismo 736x1312 pero
        // 1.7MB png → 150-350KB jpeg (~10×) — la cara del avatar perdía
        // textura y proporción percibida en i2i (diagnóstico medido en BD:
        // scripts/_diag patrón; reporte del usuario con evidencia visual).
        // NO volver a jpeg aquí sin A/B de cara.
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
            // En PARALELO (antes: secuencial — cara + N extras en fila sumaban
            // segundos antes del submit). El orden se preserva: cara primero.
            const urls: string[] = await Promise.all([
                ctx.uploadRef(
                    ctx.referenceImage.base64,
                    ctx.referenceImage.mimeType,
                ),
                ...extras.map((r) => ctx.uploadRef(r.base64, r.mimeType)),
            ])
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
            // Con clone, la ESCENA la lleva la IMAGEN → el texto de escena es
            // corto (solo la pose), así que el piso baja a 500 y ese presupuesto
            // se reinvierte en el ancla de IDENTIDAD (cara + medidas del avatar).
            // Sin clone, la escena viene por texto largo → piso 1300 (fix Fase 6).
            const SCENE_FLOOR = hasClone ? 500 : 1300
            // IDENTITY LOCK (core del avatar = MISMA cara Y MISMO físico siempre):
            // a peso alto el clone bleedea su cara, pelo, pecas Y cuerpo → Seedream
            // salía con la cara/pelo del clone y perdía las medidas de MiaUltra
            // (reporte del usuario). Del clone se toma SOLO outfit/pose/escena; la
            // PERSONA (cara + atributos + cuerpo/medidas) es SIEMPRE la del avatar.
            const cloneFaceGuard = hasClone
                ? ` CRITICAL IDENTITY LOCK — the avatar is ONE consistent person: from the CLONE reference take ONLY the outfit, pose, framing and setting, NOTHING about the person herself. Her face, facial features, bone structure, freckles/moles, skin tone, EYE COLOUR, HAIR colour, AND her BODY proportions, curves, height and measurements must ALL come from the avatar (the FIRST image + the body spec below), NEVER from the clone (whose face and body are a faceless mannequin). Render her face clearly and well-lit (not in shadow) so she reads as the SAME person every time.`
                : ''
            const anchorHead = `The person in the FIRST attached reference image is the subject — keep her EXACT face, facial features and likeness from that image.${faceFidelityClause}${cloneFaceGuard} `
            // Guard anti-duplicación: los prompts de VIDEO (movimiento/secuencia:
            // "as they turn… then… concluding with…") que se cuelan al campo de
            // imagen hacían que Seedream renderizara al sujeto en varias poses =
            // 2 personas. Se fuerza UN solo sujeto en UNA pose.
            const anchorTail = `${hairClause}${eyeClause}${extraClauses} Render EXACTLY ONE person — a single subject in ONE pose; do NOT duplicate the figure, show multiple poses side by side, or add any extra people. Follow the SCENE, POSE and ACTION described below EXACTLY.`
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
                // Se CONSERVA la descripción del clon (antes se borraba por
                // redundante con la imagen) para REANCLAR los accesorios finos —
                // tiara, collar/pendiente — que Seedream "limpia" si solo van en
                // la imagen (Qwen los clava porque usa imagen + texto). Solo se
                // quitan los corchetes/label para que lea como prosa natural.
                sceneText = sceneText
                    .replace(/\[CLONE:\s*/gi, '')
                    .replace(/\]/g, ' ')
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
