import type { PhysicalMeasurements } from '@/@types/supabase'
import { generateImageKie } from '@/services/KieService'
import { urlToDataUrl } from '@/utils/imageStitch'
import {
    BODY_SHEET_NEGATIVE_PROMPT,
    BODY_SHEET_NUDE_NEGATIVE_PROMPT,
    BODY_SHEET_REFINE_MODEL,
    BODY_TURNAROUND_TEMPLATE_URL,
    buildBodySheetCurves,
    buildBodySheetPrompt,
    buildTurnaroundRefinePrompt,
} from '@/utils/bodySheetPrompt'

export interface BodySheetPair {
    /** Hoja canónica VESTIDA — la que ven todos los motores (incl. los NO
     *  permisivos, que un desnudo bloquearía). null si se pidió solo la nude. */
    url: string | null
    /** Hoja NUDE — solo viaja en runs NSFW a motores permisivos. null si el
     *  motor la rechazó: NO rompe el flujo, el avatar se queda sin variante
     *  NSFW y esos runs caen al cuerpo por texto (comportamiento previo). */
    nudeUrl: string | null
    /** true si se usó la plantilla fija (i2i) en vez del fallback t2i. */
    usedTemplate: boolean
}

/**
 * Genera las DOS hojas del Body Lab de un avatar en una sola acción.
 *
 * POR QUÉ DOS (2026-07-25): la hoja vestida se inyecta como body ref en TODOS
 * los motores —incluidos los no permisivos, que un turnaround desnudo bloquea—
 * pero en runs NSFW su ropa se FILTRA al resultado (bug live en Seedream+Wan+
 * Qwen; en MuleRouter la panti sobrevivía a toda prohibición de texto). Con las
 * dos, cada una viaja solo donde es segura (gating en AvatarStudioMain).
 *
 * Se corren en PARALELO: comparten la carga de la plantilla y el motor, así que
 * el costo en tiempo es ~1 generación aunque sean 2 llamadas.
 *
 * Extraído de los 3 hosts (Studio drawer, drawer compartido, Creator) que
 * duplicaban este flujo — la variante nude habría triplicado la duplicación.
 */
export async function generateBodySheetPair(params: {
    measurements: PhysicalMeasurements
    /** Modelo KIE elegido en el selector del Body Lab. */
    model: string
    /** Qué generar: ambas (default) o SOLO una — el botón de refresh por hoja
     *  evita pagar las dos cuando solo falló/no gusta una. */
    only?: 'clothed' | 'nude'
}): Promise<BodySheetPair> {
    const { measurements, model } = params
    const wantClothed = params.only !== 'nude'
    const wantNude = params.only !== 'clothed'

    // Preferido: plantilla FIJA de turnaround + i2i → poses/layout consistentes
    // de la plantilla + curvas del config. Fallback: t2i si no está o falla.
    let tmpl: { base64: string; mimeType: string } | null = null
    try {
        const dataUrl = await urlToDataUrl(BODY_TURNAROUND_TEMPLATE_URL)
        const mt = dataUrl.match(/^data:(.+);base64,(.+)$/)
        if (mt) tmpl = { mimeType: mt[1], base64: mt[2] }
    } catch {
        // plantilla ausente → fallback t2i
    }

    // Sin plantilla no se puede t2i con Seedream Pro (i2i-only) → cae a Wan.
    const t2iModel =
        model === BODY_SHEET_REFINE_MODEL ? 'wan/2-7-image' : model

    const run = (nude: boolean) =>
        tmpl
            ? generateImageKie({
                  prompt: buildTurnaroundRefinePrompt(measurements, { nude }),
                  model,
                  aspectRatio: '16:9',
                  referenceImage: tmpl,
                  bodyEmphasis: buildBodySheetCurves(measurements),
                  negativePrompt: nude
                      ? BODY_SHEET_NUDE_NEGATIVE_PROMPT
                      : BODY_SHEET_NEGATIVE_PROMPT,
              })
            : generateImageKie({
                  prompt: buildBodySheetPrompt(measurements, { nude }),
                  model: t2iModel,
                  aspectRatio: '16:9',
                  negativePrompt: nude
                      ? BODY_SHEET_NUDE_NEGATIVE_PROMPT
                      : BODY_SHEET_NEGATIVE_PROMPT,
              })

    const [clothed, nude] = await Promise.all([
        wantClothed
            ? run(false)
            : Promise.resolve({ success: false as const, error: 'skipped' }),
        // La nude puede rebotar (filtro del motor) sin tumbar la generación:
        // se captura aquí para que la vestida siempre llegue.
        wantNude
            ? run(true).catch(() => ({
                  success: false as const,
                  error: 'nude sheet failed',
              }))
            : Promise.resolve({ success: false as const, error: 'skipped' }),
    ])

    // Solo es error si falló lo que SÍ se pidió.
    if (wantClothed && !clothed.success) throw new Error(clothed.error)
    if (params.only === 'nude' && !nude.success) {
        throw new Error('No se pudo generar la variante NSFW')
    }

    return {
        url: clothed.success ? clothed.url : null,
        nudeUrl: nude.success ? nude.url : null,
        usedTemplate: !!tmpl,
    }
}
