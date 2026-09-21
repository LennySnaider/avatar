/**
 * Ruta Qwen 3 (Alibaba) → `qwen3/pro-image-to-image` y `qwen3/image-to-image`.
 *
 * Es un motor IMAGE-TO-IMAGE PURO: `image_urls` es obligatorio en la doc de
 * KIE, así que sin imagen de entrada no hay petición que mandar.
 *
 * Aislada de la ruta de Qwen 2 a propósito. Comparten apellido pero NO
 * contrato: Qwen 2 manda `image_url` (singular, a veces string suelto) y aquí
 * el campo es `image_urls` (array). Los prompts de Qwen 2 NO se heredan a
 * ciegas: los tramos del Clone Ref salen de `cloneTier`, y el tramo EXACT es el
 * modo LIENZO calibrado en seedream.ts / wan.ts (ropa y pose mandan desde la
 * imagen, cuerpo clavado en cm, pelo = color de la avatar + peinado de la foto).
 */

import type { ImageRoute, ImageRouteContext, KieImageRequest } from '../context'
import { engineCaps } from '../engineCaps'
import { cloneTier } from '@/utils/cloneTiers'
import {
    relocatePoseTag,
    capAtWordBoundary,
    stripIdentityRedundancy,
    flattenJsonPromptToProse,
    planExtraRefs,
    hairClauseCompact,
    eyeClause,
    INTACT_BODY_CLAUSE,
} from '../shared'

/** Doc KIE: `prompt` ≤ 5000. Se deja margen igual que en la ruta de Qwen 2. */
const PROMPT_CAP = 4800

/** Sub-cap del spec corporal dentro del ancla: largo satura al editor. */
const BODY_CAP = 1200

/**
 * Integración del face-swap (la de seedream.ts en canvas): sin ella la cara
 * llega con la luz y la piel del retrato de referencia, no de la foto.
 */
const BLEND_CLAUSE =
    " Blend the swap invisibly: relight her face to the scene's own light direction and colour, with the same grain, sharpness and skin texture as the rest of the photo — no pasted-on look, the head at natural size for the body."

/** `image_size` por defecto de la doc, y fallback si el ratio no es válido. */
const RATIO_FALLBACK = '16:9'

async function build(ctx: ImageRouteContext): Promise<KieImageRequest> {
    const caps = engineCaps(ctx.model)

    // i2i PURO. El guard vive aquí, antes de construir nada, porque KIE ACEPTA
    // el task sin `image_urls` y falla después con un 500 sin cuerpo útil: sin
    // este throw el usuario pagaría el hold de una tarea que nunca podía salir.
    if (!ctx.referenceImage) {
        throw new Error(
            'Qwen 3 es un editor: necesita una imagen de entrada. Usa un avatar ' +
                'con foto de cara, un Clone Ref o una imagen a editar — o elige ' +
                'un motor que genere desde texto (Seedream, Z-Image, GPT Image 2.5).',
        )
    }

    // Mismo pre-proceso que Qwen 2, por la misma razón medida: un blob JSON con
    // llaves y comillas descarrila al editor, y el preámbulo de identidad +
    // [BODY:] + [FACE:] lo SATURAN cuando esa identidad ya viaja en la imagen.
    const escena = stripIdentityRedundancy(
        relocatePoseTag(flattenJsonPromptToProse(ctx.prompt)),
        true,
    )

    // IDENTIDAD DEL AVATAR. Va aparte y SIEMPRE, porque el strip de arriba
    // acaba de borrar el preámbulo de edad, `[BODY:]` y `[FACE:]`: sin esto el
    // prompt se queda solo con la escena y el motor rinde a otra persona
    // (reporte con evidencia: tres avatares distintas salieron idénticas y una
    // pelirroja salió morena). El pelo y los ojos vuelven por aquí y no por los
    // tags justamente porque esto no pasa por el strip.
    const hair = hairClauseCompact(ctx.hairEmphasis)
    const eyes = eyeClause(ctx.eyeEmphasis)
    // El cuerpo solo si la ESCENA no lo trae ya (el usuario pegó el spec del
    // perfil o una hoja del Body Lab): inyectarlo dos veces lo amplifica.
    const bodyAllowed =
        !!ctx.bodyEmphasis && !/hip-to-waist ratio/i.test(escena)
    const body = bodyAllowed
        ? ` Her body: ${capAtWordBoundary(ctx.bodyEmphasis!, BODY_CAP, ctx.model)}.`
        : ''
    const identidad = `${hair}${eyes}${body}${INTACT_BODY_CLAUSE}`

    const faceUrl = await ctx.uploadRef(ctx.referenceImage)

    // ── PROMPT AUTO-CONTENIDO (Body Lab) ─────────────────────────────────
    // La hoja del Body Lab se define a sí misma: su prompt ya dice qué es la
    // referencia, qué copiar de ella y qué no. Envolverla en el ancla de
    // identidad —que habla de conservar una cara que la plantilla no aporta—
    // la deforma, y es lo que hacía que la hoja vestida y la nude salieran con
    // cuerpos distintos. Mismo trato que en la ruta de Seedream.
    if (ctx.selfContainedPrompt) {
        return {
            model: ctx.model,
            input: baseInput(ctx, caps, escena, [faceUrl]),
            fullApiPrompt: escena,
        }
    }

    const clone = (ctx.referenceImages ?? []).find((r) => r.role === 'clone')

    // ── CON CLONE REF ────────────────────────────────────────────────────
    // Qwen EDITA la PRIMERA imagen, así que el lienzo es el CLONE (de él salen
    // pose, cuerpo, outfit y escena) y la cara del avatar entra SEGUNDA con un
    // face-swap explícito. Ya estaba medido en la ruta de Qwen 2 ("con la cara
    // como imagen 1, Qwen anclaba la composición del RETRATO") y esta ruta
    // repitió el error hasta que se comprobó en vivo: con la cara primero
    // devolvía la mujer del clone; invirtiendo el orden, devuelve a la avatar
    // con el vestuario y el sitio del clone.
    if (clone) {
        const cloneUrl = await ctx.uploadRef(clone)
        // TRAMOS del Clone Ref: los de `cloneTier` (utils/cloneTiers), la fuente
        // de verdad que también usa planExtraRefs — NO la escalera vieja de
        // Qwen 2. Con aquella, a 65% (STRONG) viajaba "keep framing close to the
        // first image, minor variation": una orden de COPIA sobre un motor que
        // edita la imagen 1 → dos generaciones idénticas a la foto (reporte
        // 20-sep). STRONG es "otra toma de la misma sesión", y hay que pedirlo
        // con esas palabras. Adaptado a Qwen: el clone es la imagen 1 (lienzo)
        // y la cara la 2, así que aquí es "the FIRST image".
        const tier = cloneTier(ctx.cloneWeight ?? 100).key
        // La ropa se ordena desde la IMAGEN, nunca "as the scene describes": el
        // caption de Gemini es una lotería — la MISMA foto salió descrita como
        // "bodysuit with integrated feet" y, en la corrida siguiente, como
        // "bodysuit" a secas (= leotardo) → piernas y pies desnudos (20-sep).
        const dressTail = ctx.nsfwIntent
            ? ' IGNORE its clothing — follow the nudity described in the scene below.'
            : ' Keep her FULLY dressed; do NOT remove or reduce clothing.'

        // ── EXACT = modo LIENZO (espejo de seedream.ts / wan.ts en canvas) ──
        // Reporte 20-sep 18:28: Clone 100% salió con piernas y pies desnudos,
        // otra pose (mano apoyada en la barra) y muslos repintados; Seedream,
        // con el MISMO clone y el MISMO caption, devolvió la foto. Además del
        // caption como fuente del vestuario (arriba), el descriptor completo
        // del cuerpo ("very large prominent bubble butt… thighs almost
        // touching") es, para un motor que EDITA la imagen 1, una orden de
        // repintar la parte de abajo — y al repintarla se van la prenda y la
        // pose (las dos corridas, con textos de outfit distintos, comparten el
        // mismo cuerpo y la misma mano apoyada). En lienzo el cuerpo se CLAVA
        // (cm + el candado anti-ensanche de la ruta de Qwen 2), no se describe;
        // el pelo es COLOR de la avatar + peinado de la foto (regla calibrada de
        // Seedream/Wan: la hairClause autoritativa pelea con el lienzo); y el
        // texto de escena queda subordinado a la foto. Las dos decisiones las
        // tomó el usuario el 20-sep. Los tramos de abajo NO cambian: a 65% es
        // "otra toma" y ahí sí manda la ficha entera de pelo y cuerpo.
        if (tier === 'exact') {
            const outfitExact = ctx.nsfwIntent
                ? ''
                : 'outfit (every garment piece, including any sunglasses, eyewear, hat, jewellery and accessories — NO restyling, NO merging pieces, and a full-length garment stays full-length down to the feet), '
            const dressExact = ctx.nsfwIntent
                ? dressTail
                : ' Keep her FULLY dressed as shown; do NOT remove or reduce clothing.'
            const lienzo = `The FIRST image is the original photo to recreate — reproduce it EXACTLY: keep the SAME ${outfitExact}pose, hands, framing, camera angle, background, setting and its lighting, shadows and colour grade. Do NOT re-imagine the scene.${dressExact} REMOVE overlaid stickers/watermarks/emojis — output a clean photo.`
            const faceSwap =
                " Swap ONLY the FACE: the output face is 100% the woman in the SECOND image and 0% the person in the first — her exact features, bone structure and likeness; never keep the first image's original face. Match the head angle and direction of the first image, and relight the face to the scene's own light with the same grain and skin texture as the rest of the photo — no pasted-on look."
            const colour = hairColourOnly(ctx.hairEmphasis)
            const hairColour = colour
                ? ` Her hair COLOUR is ${colour} — recolor if needed; keep the exact hairstyle, cut, length and up/down styling from the first image.`
                : ''
            const dense = bodyAllowed ? denseBodySpec(ctx.bodyEmphasis!) : ''
            const bodyExact = !bodyAllowed
                ? ''
                : dense
                  ? ` Her BODY measures ${dense}: keep her hip width, waist and overall frame EXACTLY at those centimetres — neither slimmer nor curvier than the numbers say; whatever glute fullness she has projects BACKWARD as depth, NOT as wide hips, thick thighs or a widened silhouette.`
                  : ` Her silhouette keeps her own real proportions (${capAtWordBoundary(ctx.bodyEmphasis!.split(';')[0].trim(), 300, ctx.model)}).`
            const cierre =
                ' Render EXACTLY ONE person, her body complete with all limbs. Above all: her FACE must remain EXACTLY the woman in the SECOND image. The text after this describes the SAME photo — use it only to resolve fine details.'
            return {
                model: ctx.model,
                input: baseInput(
                    ctx,
                    caps,
                    `${lienzo}${faceSwap}${hairColour}${eyes}${bodyExact}${cierre} ${escena}`,
                    [cloneUrl, faceUrl],
                ),
                fullApiPrompt: escena,
            }
        }

        const outfitDetail = ctx.nsfwIntent
            ? ''
            : ' (every garment, its colour, cut and accessories)'
        const fidelidad =
            tier === 'strong'
                ? `The FIRST image is the WARDROBE, LOCATION and POSE reference: she wears that same outfit${outfitDetail}, stands in that same place and holds a pose of that same family — but this is ANOTHER SHOT of that session: shift the camera angle and the exact framing, and let her weight, hands and expression fall differently. Same wardrobe and same place, DIFFERENT photograph — never a pixel copy.${dressTail}`
                : tier === 'moderate'
                  ? `The FIRST image is a STYLE reference: keep the KIND of outfit${ctx.nsfwIntent ? '' : ' (its category, silhouette and colour palette)'}, the KIND of place and the overall mood — then reinvent the garment's details, the pose, the framing and the composition.${dressTail}`
                  : `The FIRST image is a MOOD reference: take ONLY its lighting quality and direction, its colour palette and its general atmosphere. Outfit, pose, framing and setting come from the scene text, not from this image.`
        // MEZCLA (reporte 20-sep, "la cara se ve sobrepuesta"): el swap sin
        // orden de integrar dejaba la cara con la luz suave y la piel mate del
        // RETRATO de referencia sobre un cuerpo con flash — un recorte. El
        // lienzo EXACT ya llevaba la cláusula de mezcla de Seedream y salía
        // integrado; estos tramos no la llevaban. Medido: la misma petición a
        // 65% con solo esta frase añadida → cara relit a la luz de la foto.
        const swap =
            'The FACE SWAP is MANDATORY: replace the face in the FIRST image ' +
            'with the face from the SECOND image (exact features and likeness) ' +
            "— never keep the first image's original face. Her HAIR also comes " +
            "from the SECOND image (colour and length), never the first one's." +
            BLEND_CLAUSE
        return {
            model: ctx.model,
            input: baseInput(
                ctx,
                caps,
                `${swap}${identidad} ${fidelidad} ${escena}`,
                [cloneUrl, faceUrl],
            ),
            fullApiPrompt: escena,
        }
    }

    // ── SIN CLONE: la cara ES el lienzo ──────────────────────────────────
    // Aquí sí manda la imagen 1, así que las cláusulas indexadas de
    // `planExtraRefs` (que asumen "la cara es la imagen 1") encajan.
    const { extras, clauses } = planExtraRefs(
        ctx.referenceImages,
        Math.max(0, (caps?.maxRefs ?? 3) - 1),
        ctx.deepfakeMode,
        ctx.cloneWeight,
        ctx.nsfwIntent,
    )
    const extraUrls = await Promise.all(extras.map((r) => ctx.uploadRef(r)))
    const faceLock =
        'The FIRST image is the person — keep her EXACT face, hair and natural ' +
        'eye colour, unchanged regardless of any ethnicity, hair colour or ' +
        'facial description stated in the text.'
    const soloWardrobe = extras.length
        ? ' The other reference images provide ONLY the wardrobe, the location and the pose — never her hair colour, her hair length or her face.'
        : ''
    const prompt = `${faceLock}${identidad}${soloWardrobe} ${escena}${clauses}`

    return {
        model: ctx.model,
        input: baseInput(ctx, caps, prompt, [faceUrl, ...extraUrls]),
        fullApiPrompt: escena,
    }
}

/**
 * Solo el COLOR de una descripción de pelo: tira largo, textura y la palabra
 * "hair". Para el tramo EXACT, donde el peinado viene de la foto y de la ficha
 * solo se toma el color (regla de seedream.ts / wan.ts en canvas). Si no queda
 * nada —la ficha solo describía forma— devuelve la frase entera antes que un
 * vacío, que dejaría el color a criterio del motor.
 */
export function hairColourOnly(hairEmphasis?: string): string {
    if (!hairEmphasis) return ''
    const colour = hairEmphasis
        .replace(HAIR_SHAPE_WORDS, ' ')
        .replace(/\b(?:in|with|into)\s+an?\s*$/i, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/^[\s,—–-]+|[\s,—–-]+$/g, '')
        .trim()
    return colour || hairEmphasis
}

const HAIR_SHAPE_WORDS =
    /\b(?:very\s+|extra\s+)?(?:long|short|medium(?:-length)?|chest-length|shoulder-length|waist-length|hip-length|chin-length|jaw-length|pixie|bob|lob|wavy|waves|straight|sleek|curly|curls|coily|kinky|braided|braids|ponytail|bun|updo|layered|layers|voluminous|messy|tousled|frizzy|silky|hairstyle|hair)\b[,\s]*/gi

/**
 * El paréntesis de cm del bodyEmphasis —"(bust Xcm, waist Ycm, hips Zcm —
 * hip-to-waist ratio R)"— sin paréntesis; '' si la ficha no lo trae. Mismo
 * recorte que la dieta del spec de seedream.ts (2026-07-23): con la foto como
 * lienzo, la forma la lleva la IMAGEN y el texto solo clava los números.
 */
export function denseBodySpec(bodyEmphasis: string): string {
    const i = bodyEmphasis.indexOf(' (bust')
    if (i < 0) return ''
    return bodyEmphasis
        .slice(i + 1)
        .split(';')[0]
        .trim()
        .replace(/^\(|\)$/g, '')
}

/** Los campos que no dependen del camino: tamaño, tramo y banderas. */
function baseInput(
    ctx: ImageRouteContext,
    caps: ReturnType<typeof engineCaps>,
    prompt: string,
    imageUrls: string[],
): Record<string, unknown> {
    const ratios = caps?.aspectRatios
    const input: Record<string, unknown> = {
        prompt: capAtWordBoundary(prompt.trim(), PROMPT_CAP, ctx.model),
        image_urls: imageUrls,
        // Ratio CRUDO, no `aspectToImageSize`: ese helper devuelve el
        // vocabulario de fal ('landscape_16_9'), que este motor no entiende.
        image_size:
            ratios && !ratios.has(ctx.aspectRatio)
                ? RATIO_FALLBACK
                : ctx.aspectRatio,
        resolution: ctx.resolution ?? caps?.defaultResolution ?? '2K',
        output_format: 'png',
        // La doc lo trae en `true`: KIE reescribe el prompt río arriba "para
        // mejorar descripciones simples". Los nuestros no son simples —vienen
        // del Body Lab y del ancla de identidad— y una reescritura invisible
        // rompe la auditoría del prompt que se guarda con cada generación.
        prompt_extend: false,
        nsfw_checker: !!ctx.safeMode,
    }
    if (ctx.negativePrompt) input.negative_prompt = ctx.negativePrompt
    // Rango de la doc; un seed fuera de él es un 422 por un dato que no aporta.
    if (
        typeof ctx.seed === 'number' &&
        Number.isInteger(ctx.seed) &&
        ctx.seed >= 0 &&
        ctx.seed <= 2147483647
    ) {
        input.seed = ctx.seed
    }
    return input
}

export const qwen3Route: ImageRoute = {
    label: 'qwen3',
    matches: (m) => m.startsWith('qwen3/'),
    isPermissive: true,
    build,
}
