/**
 * Ruta Qwen 3 (Alibaba) → `qwen3/pro-image-to-image` y `qwen3/image-to-image`.
 *
 * Es un motor IMAGE-TO-IMAGE PURO: `image_urls` es obligatorio en la doc de
 * KIE, así que sin imagen de entrada no hay petición que mandar.
 *
 * Aislada de la ruta de Qwen 2 a propósito. Comparten apellido pero NO
 * contrato: Qwen 2 manda `image_url` (singular, a veces string suelto) y aquí
 * el campo es `image_urls` (array). Los prompts de clone/deepfake de Qwen 2
 * están calibrados A/B contra `qwen2/image-edit` y NO se heredan a ciegas: esta
 * v1 cubre el path plano (cara) y el de clone, ambos con los helpers comunes.
 */

import type { ImageRoute, ImageRouteContext, KieImageRequest } from '../context'
import { engineCaps } from '../engineCaps'
import {
    relocatePoseTag,
    capAtWordBoundary,
    stripIdentityRedundancy,
    flattenJsonPromptToProse,
    planExtraRefs,
} from '../shared'

/** Doc KIE: `prompt` ≤ 5000. Se deja margen igual que en la ruta de Qwen 2. */
const PROMPT_CAP = 4800

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
    let promptText = relocatePoseTag(flattenJsonPromptToProse(ctx.prompt))
    promptText = stripIdentityRedundancy(promptText, true)

    // Cara primero (imagen 1, que es lo que asumen las cláusulas indexadas) y
    // hasta `maxRefs - 1` acompañantes en el orden canónico del resto de rutas.
    const faceUrl = await ctx.uploadRef(ctx.referenceImage)
    const { extras, clauses } = planExtraRefs(
        ctx.referenceImages,
        Math.max(0, (caps?.maxRefs ?? 3) - 1),
        ctx.deepfakeMode,
        ctx.cloneWeight,
        ctx.nsfwIntent,
    )
    const extraUrls = await Promise.all(extras.map((r) => ctx.uploadRef(r)))
    const promptConClausulas = clauses ? `${promptText}${clauses}` : promptText

    const ratios = caps?.aspectRatios
    const input: Record<string, unknown> = {
        prompt: capAtWordBoundary(promptConClausulas, PROMPT_CAP, ctx.model),
        image_urls: [faceUrl, ...extraUrls],
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

    return { model: ctx.model, input, fullApiPrompt: promptConClausulas }
}

export const qwen3Route: ImageRoute = {
    label: 'qwen3',
    matches: (m) => m.startsWith('qwen3/'),
    isPermissive: true,
    build,
}
