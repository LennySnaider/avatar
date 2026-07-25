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
    flattenJsonPromptToProse,
    hairClauseCompact as buildHairClause,
    INTACT_BODY_CLAUSE,
    BODY_SPEC_NOT_WARDROBE_CLAUSE,
} from '../shared'

// temperBodyForQwen ELIMINADO (2026-07-25): mutar el spec por-motor era el
// approach equivocado ("no se trata de quitarle a una y ponerle a otra — debe
// ser consistente para todas"). La coherencia se arregló EN LA FUENTE
// (bodyDescriptors: buckets de cintura por ratio real, glúteo=proyección no
// anchura, puente sin mandato de grosor) — todos los motores reciben el MISMO
// spec no-contradictorio.

async function build(ctx: ImageRouteContext): Promise<KieImageRequest> {
    // PRESUPUESTO: los docs actuales de qwen2/image-edit dicen prompt ≤ 5000
    // chars (2026-07-23, aportados por el usuario) — el cap viejo de 800 era
    // una medición de la era qwen/* y DECAPITABA el Body Lab entero (medido:
    // refine 3203 → 799, morían RESHAPE/CONSISTENCY/ANATOMY/XXL). Se sube a
    // 4800 (margen bajo 5000); si KIE rechazara por longitud, el retry
    // self-healing de KieService ("text length") recorta y reenvía solo.
    // El ancla sigue COMPACTA por otra razón vigente: Qwen es un editor
    // literal y el texto de identidad verboso lo SATURA (verificado A/B) —
    // corto no por límite, sino por adherencia.

    // Override de pelo AUTORITATIVO: Qwen es un editor literal que stripea
    // [BODY:]/[FACE:] (bodyInAnchor=true) → perdía el color de pelo del avatar
    // y seguía el "golden blonde" de la escena. Como el clause NO va en los
    // tags stripeados sino en el ancla, sobrevive y recolorea. hairEmphasis solo
    // se puebla en GENERACIÓN (no en EDIT, donde el usuario recolorea a mano).
    const hairClause = buildHairClause(ctx.hairEmphasis)

    // Qwen NO es nano → reubica la pose; cap 4000 (docs: 5000).
    // JSON→prosa primero: un blob JSON con llaves/comillas descarrila al
    // editor y quema presupuesto → CERO escena útil.
    let promptText = relocatePoseTag(flattenJsonPromptToProse(ctx.prompt))
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
    const capped = capAtWordBoundary(promptText, 4000, ctx.model)
    // Lever 3 anatomía (2026-07-24, "no basta"): la oración "Her anatomy: …"
    // viaja en la COLA de la escena (~char 3200 de 3400) y Qwen la ignoró DOS
    // veces (v1 condicional y v2 imperativa — verificado por recordInfo que SÍ
    // viajaba). En un editor literal el FRENTE manda (por eso el face-lock va
    // ahí). Se EXTRAE de la cola y se re-inyecta en el ancla (tras el body
    // clause) en los paths plain y clone. MOVE, no duplicate.
    const anatMatch = capped.match(/\sHer anatomy:[\s\S]*$/)
    const anatomySentence = anatMatch ? anatMatch[0].trim() : ''
    const cappedSansAnatomy = anatMatch
        ? capped.slice(0, anatMatch.index).trim()
        : capped
    const anatomyFront = anatomySentence ? ` ${anatomySentence}` : ''
    let resolvedModel = ctx.model
    const input: Record<string, unknown> = {
        prompt: capped,
        image_size: ctx.aspectRatio,
        enable_safety_checker: !!ctx.safeMode,
        nsfw_checker: !!ctx.safeMode,
    }
    // Anti-rubor: si viaja anatomía NSFW, niega el rosa en el seno por el
    // canal nativo también (supresión de artefacto, NO mutación del spec).
    const antiPinkNegative = anatomySentence
        ? 'pink areolas, pink-tinted breast skin, blushed chest, sunburned chest'
        : ''
    const negativeCombined = [ctx.negativePrompt, antiPinkNegative]
        .filter(Boolean)
        .join(', ')
    if (negativeCombined) {
        input.negative_prompt = negativeCombined
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
                            ? `Keep the SAME outfit (all garment pieces, NO restyling or merging into a one-piece), pose, framing and FULL background/setting (NOT a plain, white or studio backdrop) as the FIRST image`
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
                    // renderiza literales). El face-swap va al FRENTE (sobrevive
                    // cualquier recorte); la cola de la descripción cede.
                    // El CUERPO del avatar manda sobre el de la foto clonada
                    // (reporte 2026-07-24: piernas flacas de la foto vs curvas del
                    // avatar). ANTES el path de clone NO inyectaba NINGÚN body clause
                    // → el cuerpo salía 100% de la foto. Mismo override que seedream:
                    // el clone aporta outfit/pose/escena, el CUERPO viene del spec.
                    // Candado BIDIRECCIONAL (2026-07-24, "Qwen sale más ancha que
                    // Seedream con las mismas medidas"): Qwen pesa las frases
                    // cualitativas de curvas sobre los cm y EXAGERA. Los números
                    // son la verdad — ni más flaca ni más ancha.
                    const cloneBodyClause = ctx.bodyEmphasis
                        ? ` Take her body proportions from THIS description, not from the first image: ${capAtWordBoundary(ctx.bodyEmphasis, 500, 'qwen-clone-body')}. Keep her hip width, waist and overall frame EXACTLY at the stated centimetres (slim if the numbers are slim); her glutes' fullness is ROUND — projecting BACKWARD as a rounded bubble shape — NOT wide hips, thick thighs or a widened silhouette.`
                        : ''
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
                    // Anti-amputación (2026-07-24, reporte: brazo amputado en un
                    // Clone 100): el path de clone solo tenía el negative — y en un
                    // editor literal el POSITIVO pesa mucho más (como el plain con
                    // INTACT_BODY_CLAUSE). Versión CONSCIENTE DEL ENCUADRE: no fuerza
                    // "feet fully rendered" (rompería un clone recortado) — solo pide
                    // que los miembros QUE LA POSE MUESTRE salgan completos, y ataca
                    // el modo de fallo real (esconder/cortar un brazo tras el cuerpo).
                    const cloneIntactClause = ` Every limb the pose shows must be anatomically COMPLETE — both arms with both hands, and legs with feet wherever the framing includes them; never sever, amputate, truncate or tuck a limb out of sight behind her body.`
                    input.prompt = `Swap ONLY the face — use the SECOND image's face (exact features, freckles, likeness), keep that person's hair and natural eye colour, NEVER the first image's original face.${hairClause}${cloneBodyClause}${cloneIntactClause}${anatomyFront} ${fidelity}: ${cloneDesc}`
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
                    input.prompt = `The FIRST image is the person — keep her EXACT face, hair and natural, matte eye colour, unchanged regardless of any ethnicity stated in the text.${hairClause} ${assetLines} Do NOT add any lettering, words, captions or watermarks of your own anywhere in the image — the ONLY artwork on the outfit is the attached design itself. ${input.prompt}`
                    console.log(
                        `[KIE] qwen2/image-edit with ${qwenUrls.length} imgs (face + ${qwenAssets.length} asset)`,
                    )
                } else {
                    input.image_url = refUrl
                    // CUERPO por TEXTO (2026-07-22): Qwen NUNCA recibía el
                    // cuerpo — no se le manda el body sheet (funde body/pose/
                    // scene) y stripIdentityRedundancy le quita el [BODY:] →
                    // su cuerpo salía de la escena + face ref (MiaUltra
                    // 119/45 salía slim). Qwen obedece el TEXTO sobre la
                    // imagen (caso "mujer coreana"), así que un spec COMPACTO
                    // (cap 200 — el presupuesto total es 800) sí ancla.
                    // Candado BIDIRECCIONAL (2026-07-24): "NOT a slimmer one" solo
                    // acotaba un lado y Qwen exageraba caderas/glúteos sobre las
                    // frases cualitativas de curvas (misma Emily 86/45/85: Seedream
                    // correcto, Qwen mucho más ancha). Los cm mandan en ambas
                    // direcciones.
                    // Desambiguación "flaca pero con glúteos redondos" (2026-07-24):
                    // Emily 86/45/85 = frame SLIM; su única curva es el glúteo
                    // (slider). Qwen leía "large round glutes" como "cuerpo ancho"
                    // → inflaba caderas/muslos. La aclaración separa REDONDEZ del
                    // glúteo (proyecta atrás) de ANCHURA del cuerpo (cm mandan).
                    // General: avatares realmente anchos ya traen "wide hips" en su
                    // texto, así que "cm mandan" los respeta.
                    const qwenBodyClause = ctx.bodyEmphasis
                        ? ` Her body (MANDATORY): ${capAtWordBoundary(ctx.bodyEmphasis, 700, 'qwen-body')} — keep her hip width, waist and overall frame EXACTLY at the stated centimetres (slim if the numbers are slim); her glutes' fullness is ROUND, projecting BACKWARD as a rounded bubble shape, NOT wide hips, thick thighs or a widened silhouette.${BODY_SPEC_NOT_WARDROBE_CLAUSE}`
                        : ''
                    // Lock de cara AUTORITATIVO y COMPACTO (cap 800): Qwen
                    // obedece el TEXTO por encima de la imagen — un prompt
                    // "mujer coreana" le cambió la cara al avatar (caso real,
                    // BD 2026-07-22). El saneador ya quita la etnicidad del
                    // texto; esto es defensa en profundidad, corta para no
                    // comerse el presupuesto de escena.
                    // INTACT_BODY_CLAUSE (positivo): Qwen es la ÚNICA ruta que
                    // dependía solo del negative_prompt para no amputar — y en un
                    // editor LITERAL el positivo pesa mucho más que el negativo.
                    // Con el empuje XXL "beyond natural anatomy at FULL intensity"
                    // el modelo "resolvía" recortando piernas/pies. Se le da la
                    // MISMA cláusula positiva que ya llevan seedream/wan/flux2/grok
                    // (el negative_prompt se conserva como defensa en profundidad).
                    input.prompt = `Keep her EXACT face, hair and natural realistic eyes from the reference image — IGNORE any nationality, ethnicity or facial description in the text.${hairClause}${qwenBodyClause}${INTACT_BODY_CLAUSE}${anatomyFront} ${cappedSansAnatomy}`
                }
            }
        } catch (e) {
            console.warn('[KIE] ref upload failed, staying text-only:', e)
        }
    }

    // Qwen impone prompt ≤ 800 chars (API qwen2/image-edit). El ancla (cara +
    // cláusula de clone) va al FRENTE, así que un recorte cae en la cola de
    // escena, nunca en la identidad.
    input.prompt = capAtWordBoundary(String(input.prompt), 4800, resolvedModel)
    return { model: resolvedModel, input, fullApiPrompt: promptText }
}

export const qwenRoute: ImageRoute = {
    label: 'qwen',
    matches: (m) => m.startsWith('qwen'),
    isPermissive: true,
    build,
}
