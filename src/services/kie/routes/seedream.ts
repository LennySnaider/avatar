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
    hasNudityIntent,
    stripIdentityRedundancy,
    relocatePoseTag,
    capAtWordBoundary,
    INTACT_BODY_CLAUSE,
    EDIT_ANCHOR_CLAUSE,
    BODY_SPEC_NOT_WARDROBE_CLAUSE,
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
        nsfw_checker: !!ctx.safeMode,
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
                hasNudityIntent(ctx.prompt),
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
            // hasBody: además de señalar la imagen 2, se RE-ANCLAN las medidas
            // en TEXTO (bodyEmphasis). Sin esto el cuerpo dependía 100% de que
            // Seedream obedeciera la imagen 2 — y su sesgo documentado es el
            // contrario (copia el build del face ref: salía flaca con el body
            // sheet curvy adjunto, reporte 2026-07-22). El body ref canónico
            // ahora es la HOJA TURNAROUND de Body Lab (4 vistas) → se explicita
            // que es UNA sola mujer para que no la lea como lámina de estilo.
            // DIETA DEL SPEC con sheet (2026-07-23, "cara/ojos raros"): el
            // bodyEmphasis completo mide ~1,630 chars (660 de prosa
            // describeBody + 886 de curvas) y con sheet esa prosa viaja
            // TRIPLICADA (imagen 2 + cm + curveBoost) — el ancla llegaba a
            // 2,292/2,700 y diluía la cara. Con sheet basta la señal DENSA:
            // el paréntesis de medidas "(bust Xcm, waist Ycm, hips Zcm —
            // ratio R)" — la forma la lleva la IMAGEN y el drama el boost.
            const cmIdx = (ctx.bodyEmphasis ?? '').indexOf(' (bust')
            const denseBodySpec = ctx.bodyEmphasis
                ? cmIdx >= 0
                    ? ctx.bodyEmphasis
                          .slice(cmIdx + 1)
                          .split(';')[0]
                          .trim()
                          .replace(/^\(|\)$/g, '')
                    : capAtWordBoundary(ctx.bodyEmphasis, 300, model)
                : ''
            const bodyClause = ctx.deepfakeMode
                ? ''
                : hasBody
                  ? `The SECOND attached image shows her real BODY (a turnaround sheet: the SAME one woman from several angles) — replicate its exact body shape, proportions, curves and build; do NOT take the body from the first image, which looks slimmer than she really is.${
                        // ORDEN = prioridad de supervivencia al cap: el guard
                        // IGNORE-clothing va ANTES del spec/curveBoost — si el
                        // presupuesto recorta, muere el refuerzo, NUNCA el
                        // guard (sin él Seedream copia la ropa interior/pose
                        // del sheet — a0c2a56).
                        ''
                    } IGNORE the second image's clothing, pose, scene, lighting and background — her outfit, pose and the scene come ONLY from ${hasClone ? 'the CLONE image and the text description' : 'the text description'}.${
                        denseBodySpec
                            ? ` Her exact measurements: ${denseBodySpec} — render THAT body, matching the second image.${BODY_SPEC_NOT_WARDROBE_CLAUSE}`
                            : ''
                    }${
                        // curveBoost (refuerzo por RATIO, d4ca3f4) también con
                        // body ref: MiaUltra (hips 119/waist 45, ratio 2.64)
                        // salía flaca AUN con el sheet + spec — Seedream
                        // necesita la orden dramática explícita (reporte
                        // 2026-07-22, 2ª recurrencia).
                        ctx.curveBoost ? ` ${ctx.curveBoost}` : ''
                    }`
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
                ? ` CRITICAL IDENTITY LOCK — the avatar is ONE consistent person: from the CLONE reference take ONLY the outfit, pose, framing and setting, NOTHING about the person herself. Her face, facial features, bone structure, skin tone, EYE COLOUR, HAIR colour, AND her BODY proportions, curves, height and measurements must ALL come from the avatar (the FIRST image + the body spec below), NEVER from the clone (whose face and body are a faceless mannequin). Render her face clearly and well-lit (not in shadow) so she reads as the SAME person every time.`
                : ''
            const anchorHead = `The person in the FIRST attached reference image is the subject — keep her EXACT face, facial features and likeness from that image.${faceFidelityClause}${cloneFaceGuard} `
            // Guard anti-duplicación: los prompts de VIDEO (movimiento/secuencia:
            // "as they turn… then… concluding with…") que se cuelan al campo de
            // imagen hacían que Seedream renderizara al sujeto en varias poses =
            // 2 personas. Se fuerza UN solo sujeto en UNA pose.
            // Face-recall al CIERRE del ancla (recency): con anclas grandes la
            // instrucción de cara del head quedaba lejos y la identidad
            // derivaba — se re-ancla justo antes de la escena.
            const anchorTail = `${hairClause}${eyeClause}${extraClauses} Render EXACTLY ONE person — a single subject in ONE pose; do NOT duplicate the figure, show multiple poses side by side, or add any extra people.${INTACT_BODY_CLAUSE} Above all: her FACE and eyes must remain EXACTLY the woman in the FIRST image. Follow the SCENE, POSE and ACTION described below EXACTLY.`
            // RESERVA DINÁMICA (2026-07-22): el piso fijo reservaba 1300 chars
            // aunque la escena midiera 160 — y ese espacio VACÍO decapitaba el
            // bodyClause (MiaUltra: curveBoost cortado a media frase y guard
            // IGNORE perdido, medido con el harness). Se reserva lo que la
            // escena REALMENTE ocupa (con margen), capado al piso de Fase 6.
            const sceneReserve = Math.min(
                SCENE_FLOOR,
                String(input.prompt).length + 50,
            )
            // TECHO DURO del body clause (2026-07-23): la reserva dinámica
            // liberaba presupuesto con escenas CORTAS y el texto de cuerpo se
            // lo comía TODO — ancla de 2292/2700 con la cara diluida →
            // "la cara/ojos se ven raros" (reporte MiaUltra, moto). Con sheet
            // el clause ya nace denso (~980: intro+guard+cm+boost) y pasa
            // entero (con margen); el techo protege el branch SIN sheet
            // (emphasis completo ~2,200 — a 1100 sobreviven prosa y cm).
            // Presupuesto libre NO usado = prompt más corto = más atención.
            const bodyClauseMax = Math.min(
                1100,
                SEEDREAM_BUDGET -
                    sceneReserve -
                    anchorHead.length -
                    anchorTail.length,
            )
            // PISO DEL CUERPO (2026-07-28) — "con Clone Ref el busto sale del
            // clon; sin Clone Ref sale bien" (reporte del usuario). Medido con
            // harness: con clone quedaban **33 chars** para el bodyClause
            // (head 828 + tail 1389 + reserva de escena 500 sobre 2750) y el
            // texto se cortaba en "…the SAME one woman from". Truncar SIEMPRE
            // mata la cola, y la cola es justo el guard IGNORE y las MEDIDAS
            // (~60 chars que valen más que toda la prosa que los precede).
            // Sin medidas el modelo solo tiene un cuerpo del que tirar: el del
            // clon. Sin clone el cap también cortaba, pero más tarde ("…rati"),
            // por eso ahí el busto salía bien y el bug parecía del clone.
            //
            // Cura: no cortar mejor — no cortar. Versión COMPACTA COMPLETA,
            // misma información sin prosa y con las medidas DELANTE, y el
            // clause no baja nunca de ahí (mismo patrón que SCENE_FLOOR con el
            // fondo). Rebasar el presupuesto blando por ~300 chars es barato
            // frente a perder el físico del avatar; el prompt final ya absorbe
            // esto igual que absorbe el piso de escena.
            const bodySheetRef =
                'the SECOND image (a turnaround sheet: the SAME one woman from several angles)'
            const sceneSource = hasClone
                ? 'the CLONE image and the text description'
                : 'the text description'
            const bodyClauseCompact = ctx.deepfakeMode
                ? ''
                : hasBody
                  ? `Her BODY${denseBodySpec ? ` measures ${denseBodySpec} and` : ''} is the one in ${bodySheetRef} — replicate that exact shape, those proportions and curves. From the sheet take ONLY the body: her outfit, pose and the scene come ONLY from ${sceneSource}.`
                  : `Her BODY${denseBodySpec ? ` measures ${denseBodySpec} and` : ''} follows the text spec below — render THAT body, visibly fuller and curvier than the reference photo suggests. Use the reference image ONLY for her face and identity.`
            // ESCALERA, no salto: completo → compacto+boost → compacto pelado.
            // El curveBoost lleva el "do NOT normalize" que se validó en A/B
            // para los ratios extremos (MiaUltra 2.64 salía flaca sin él), así
            // que viaja siempre que quepa — pero NUNCA a costa de las medidas:
            // su propio comentario avisa de que cada char del boost compite
            // con la CARA dentro del ancla ("cara/ojos raros", 2026-07-23).
            const compactWithBoost = ctx.curveBoost
                ? `${bodyClauseCompact} ${ctx.curveBoost}`
                : bodyClauseCompact
            let fitBodyClause = bodyClause
            if (bodyClauseMax <= 0 || bodyClause.length > bodyClauseMax) {
                fitBodyClause =
                    compactWithBoost.length <= bodyClauseMax
                        ? compactWithBoost
                        : bodyClauseCompact
                if (fitBodyClause.length > bodyClauseMax) {
                    console.warn(
                        `[KIE] Seedream body clause en su PISO (${bodyClauseCompact.length} chars, presupuesto ${bodyClauseMax}) — las medidas viajan enteras a costa de ${bodyClauseCompact.length - Math.max(bodyClauseMax, 0)} chars de exceso`,
                    )
                }
            }
            // EDICION: el ancla ENTERA sobra. Presenta la imagen como referencia
            // de CARA, re-especifica el cuerpo (fitBodyClause) y exige cuerpo
            // completo — al editar eso reencuadra y redibuja lo que deberia
            // quedarse quieto. Solo se anteponia la cola y el cuerpo seguia
            // colandose por la cabeza (lo pillo la prueba del dispatcher).
            const seedreamAnchor = ctx.editMode
                ? EDIT_ANCHOR_CLAUSE
                : `${anchorHead}${fitBodyClause}${anchorTail}`
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
