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
    /** Motivo REAL si la nude falló (moderación del motor, timeout, código
     *  KIE…) — antes el catch lo descartaba y era imposible diagnosticar por
     *  qué un avatar se quedaba sin variante NSFW. Para log + toast. */
    nudeError?: string
    /** true si se usó la plantilla fija (i2i) en vez del fallback t2i. */
    usedTemplate: boolean
    /** true si la hoja vestida se derivó de la NUDE (cuerpo heredado, no
     *  regenerado). false = salió de la plantilla, o porque la nude falló o
     *  porque no se pidió — en ese caso las dos hojas pueden diferir. */
    clothedFromNude: boolean
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
 * Se corren ENCADENADAS (2026-07-28), antes en paralelo: primero la NUDE sobre
 * la plantilla, y después la VESTIDA sobre la nude ya generada. El paralelo
 * costaba ~1 generación de reloj, pero producía dos cuerpos distintos: Seedream
 * no acepta `seed`, así que la única forma de que las dos hojas sean la misma
 * mujer es que la segunda herede la imagen de la primera. Si la nude rebota, la
 * vestida vuelve a salir de la plantilla — nunca se queda sin generar.
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
    /**
     * Hoja NUDE que el avatar YA tiene. Solo se usa con `only: 'clothed'`: al
     * regenerar únicamente la vestida no hay nude en esta corrida de la que
     * heredar, y volver a la plantilla la haría divergir de la nude guardada —
     * el mismo bug que el encadenado viene a matar. Con esto, refrescar una
     * sola hoja sigue dando la misma mujer.
     */
    nudeSheet?: { base64: string; mimeType: string }
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

    /**
     * `ref` = imagen de la que parte el i2i. Normalmente la plantilla; para la
     * hoja VESTIDA encadenada, la hoja NUDE ya generada de este avatar
     * (`fromOwnSheet`), que cambia el prompt de "construí este cuerpo" a
     * "conservá ESTE cuerpo, cambiá solo la ropa".
     */
    const run = (
        nude: boolean,
        ref: { base64: string; mimeType: string } | null,
        fromOwnSheet = false,
    ) =>
        ref
            ? generateImageKie({
                  prompt: buildTurnaroundRefinePrompt(measurements, {
                      nude,
                      fromOwnSheet,
                  }),
                  model,
                  aspectRatio: '16:9',
                  referenceImage: ref,
                  bodyEmphasis: buildBodySheetCurves(measurements),
                  // La hoja se define a sí misma: su prompt ya dice qué es la
                  // referencia, qué copiar de ella y qué no. Envolverla en el
                  // ancla de identidad —que habla de conservar una cara que la
                  // plantilla no aporta— la recortaba a la mitad, y en puntos
                  // DISTINTOS para la vestida y la nude: cada hoja salía con un
                  // cuerpo distinto.
                  selfContainedPrompt: true,
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

    // ENCADENADO (2026-07-28), no paralelo: la nude primero, y la vestida se
    // deriva de ELLA en vez de volver a partir de la plantilla. Seedream no
    // acepta `seed` (spec de KIE), así que dos generaciones independientes del
    // mismo prompt dan cuerpos distintos por definición — heredar la imagen es
    // el único modo de garantizar que las dos hojas sean la misma mujer.
    // Cuesta el doble de reloj; ese es el trato.
    const nude = wantNude
        ? await run(true, tmpl).catch((e: unknown) => ({
              // La nude puede rebotar (filtro del motor) sin tumbar la
              // generación — pero el MOTIVO se conserva (antes se descartaba y
              // el fallo era indistinguible).
              success: false as const,
              error: e instanceof Error ? e.message : String(e),
          }))
        : { success: false as const, error: 'skipped' }

    // La hoja VESTIDA es la que NO puede faltar: viaja a todos los motores,
    // incluidos los que un desnudo bloquearía. Si la nude no salió, se genera
    // desde la plantilla como siempre — un rechazo de moderación NO puede
    // dejar al avatar sin ninguna de las dos hojas.
    let clothedRef = tmpl
    let clothedFromNude = false
    if (wantClothed && nude.success && nude.url) {
        try {
            const dataUrl = await urlToDataUrl(nude.url)
            const mt = dataUrl.match(/^data:(.+);base64,(.+)$/)
            if (mt) {
                clothedRef = { mimeType: mt[1], base64: mt[2] }
                clothedFromNude = true
            }
        } catch (e) {
            console.warn(
                '[BodySheet] No se pudo leer la hoja NSFW para encadenar; la vestida sale de la plantilla:',
                e,
            )
        }
    } else if (wantClothed && !wantNude && params.nudeSheet) {
        // Refresh de SOLO la vestida: se hereda de la nude que el avatar ya
        // tiene, para que refrescar una hoja no la separe de la otra.
        clothedRef = params.nudeSheet
        clothedFromNude = true
    }
    const clothed = wantClothed
        ? await run(false, clothedRef, clothedFromNude)
        : { success: false as const, error: 'skipped' }

    const nudeError =
        wantNude && !nude.success ? nude.error || 'nude sheet failed' : undefined
    if (nudeError) {
        console.warn('[BodySheet] Variante NSFW falló:', nudeError)
    }

    // Solo es error si falló lo que SÍ se pidió.
    if (wantClothed && !clothed.success) throw new Error(clothed.error)
    if (params.only === 'nude' && !nude.success) {
        throw new Error(`No se pudo generar la variante NSFW: ${nudeError}`)
    }

    return {
        url: clothed.success ? clothed.url : null,
        nudeUrl: nude.success ? nude.url : null,
        nudeError,
        usedTemplate: !!tmpl,
        clothedFromNude,
    }
}
