/**
 * Ruta GPT Image 2.5 Flare (OpenAI vía KIE) — releva a GPT Image 2 en el
 * selector. Dos ids para un mismo motor, como en Seedream y FLUX.2:
 * `gpt-image-2-5-flare-text-to-image` y, en cuanto viaja una referencia,
 * `gpt-image-2-5-flare-image-to-image` (campo `input_urls`, máx 16).
 *
 * Deliberadamente SEPARADA del adaptador de GPT Image 2, que vive en tres
 * sitios acoplados de `KieService` más dos ramas de prompt en el Studio.
 * Aquel matchea por igualdad exacta, así que este motor no lo toca: cae al
 * despachador y se construye aquí. Duplicar unas líneas sale más barato que
 * meter mano en el camino que hoy factura.
 */

import type { ImageRoute, ImageRouteContext, KieImageRequest } from '../context'
import type { EngineResolution } from '../engineCaps'
import { engineCaps } from '../engineCaps'
import { capAtWordBoundary, relocatePoseTag, planExtraRefs } from '../shared'

/** Doc KIE: `prompt` ≤ 20000. Margen igual que en el resto de rutas. */
const PROMPT_CAP = 19000

const MODEL_T2I = 'gpt-image-2-5-flare-text-to-image'
const MODEL_I2I = 'gpt-image-2-5-flare-image-to-image'

/**
 * Cuatro ratios de la doc soportan SOLO 1K; pedirles 2K o 4K es un 422.
 * Exportada porque es la única regla condicional real del motor y merece test.
 */
export const RATIOS_SOLO_1K = new Set(['27:16', '16:27', '9:8', '8:9'])

export function flareResolution(
    aspectRatio: string,
    requested: EngineResolution,
): EngineResolution {
    return RATIOS_SOLO_1K.has(aspectRatio) ? '1K' : requested
}

async function build(ctx: ImageRouteContext): Promise<KieImageRequest> {
    const caps = engineCaps(ctx.model)
    const promptText = relocatePoseTag(ctx.prompt)

    const ratios = caps?.aspectRatios
    // 'auto' es el default de la doc: mejor que inventar un ratio que la API
    // rechace si alguien amplía el selector del Studio en el futuro.
    const aspectRatio =
        ratios && !ratios.has(ctx.aspectRatio) ? 'auto' : ctx.aspectRatio

    // La cara es la imagen 1 (lo que asumen las cláusulas indexadas); el resto
    // va en el orden canónico compartido con Seedream/Wan/FLUX.2.
    const maxRefs = caps?.maxRefs ?? 16
    const plan = ctx.referenceImage
        ? planExtraRefs(
              ctx.referenceImages,
              Math.max(0, maxRefs - 1),
              ctx.deepfakeMode,
              ctx.cloneWeight,
              ctx.nsfwIntent,
          )
        : null
    const refs = ctx.referenceImage
        ? [ctx.referenceImage, ...(plan?.extras ?? [])]
        : []
    const fullApiPrompt = plan?.clauses
        ? `${promptText}${plan.clauses}`
        : promptText

    const input: Record<string, unknown> = {
        prompt: capAtWordBoundary(fullApiPrompt, PROMPT_CAP, ctx.model),
        aspect_ratio: aspectRatio,
        resolution: flareResolution(
            aspectRatio,
            ctx.resolution ?? caps?.defaultResolution ?? '2K',
        ),
    }

    // `background` se omite a propósito: su default es 'auto' y exponerlo sería
    // un control de UI sin caso de uso en el Studio.

    if (refs.length === 0) {
        return { model: MODEL_T2I, input, fullApiPrompt }
    }

    input.input_urls = await Promise.all(
        refs.slice(0, maxRefs).map((r) => ctx.uploadRef(r)),
    )
    return { model: MODEL_I2I, input, fullApiPrompt }
}

export const gptImage25Route: ImageRoute = {
    label: 'gpt-image-2-5-flare',
    matches: (m) => m.startsWith('gpt-image-2-5-flare'),
    // OpenAI filtra río arriba: el prompt pasa por el saneador en vez de viajar
    // crudo. Marcarlo permisivo solo cambiaría un rechazo por otro, más caro.
    isPermissive: false,
    build,
}
