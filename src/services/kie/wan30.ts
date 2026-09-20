/**
 * `input` de wan/3-0-video (KIE). PURO: sin red ni Supabase, para poder probar
 * las reglas sin gastar créditos — mismo criterio que `seedance25Scene`.
 *
 * Wan 3.0 es el motor SIN CENSURA del catálogo. Verificado en vivo el
 * 2026-09-19: con `nsfw_checker:false`, primer fotograma VESTIDO y un prompt
 * explícito, genera el desnudo. El "Wan 2.2 Sin Censura" rechazó el mismo
 * prompt dos veces con `failCode 400 "The input or output was flagged as
 * sensitive"` pese a su propio `nsfw_checker:false` — el nombre de aquel ya no
 * describe lo que hace.
 *
 * Precio MEDIDO (créditos antes/después, ×$0.005): 8 cr/s en 480P, 16 en 720P
 * y 32 en 1080P — lineal en duración y el doble por escalón. Un 1080P de 30s
 * son $4.80, así que el precio NO puede ser un número plano en el catálogo.
 */
import { seedance25Scene } from './seedance25Scene'

/** Tope del prompt según docs.kie.ai (wan/3-0-video). */
const MAX_PROMPT = 20_000
/** Rango de `duration` que la API acepta; el 31 vuelve con 422. */
const MIN_DUR = 2
const MAX_DUR = 30
const DEFAULT_DUR = 5

/**
 * MAYÚSCULAS. Wan 2.2 quiere '720p' y wan 3.0 quiere '720P': mandar la de uno
 * al otro devuelve `{"code":500,"msg":"resolution is not within the range of
 * allowed options"}`. La UI habla en minúscula (su convención), así que la
 * traducción vive aquí y no en el submit.
 */
const RESOLUCIONES: Record<string, string> = {
    '480p': '480P',
    '720p': '720P',
    '1080p': '1080P',
}

export interface Wan30InputParams {
    prompt: string
    firstFrameUrl?: string | null
    lastFrameUrl?: string | null
    referenceImageUrls?: string[]
    resolution?: string
    duration?: number
    aspectRatio?: string
}

export function buildWan30Input(
    params: Wan30InputParams,
): Record<string, unknown> {
    const refs = params.referenceImageUrls ?? []

    // ESCENA EXCLUYENTE. La API: "first_frame_url / last_frame_url and
    // reference_*_urls are mutually exclusive" (422) — el comodín cubre imagen,
    // vídeo y audio, así que es el MISMO contrato de Seedance 2.5 y se decide
    // con su función en vez de duplicar el criterio (gana referencias: son una
    // aportación deliberada del usuario, mientras que el primer fotograma suele
    // derivarlo el Studio para encadenar clips).
    const escena = seedance25Scene({
        hasFirstFrame: !!params.firstFrameUrl,
        imageRefCount: refs.length,
        videoRefCount: 0,
        audioRefCount: 0,
    })

    const input: Record<string, unknown> = {
        prompt: (params.prompt ?? '').slice(0, MAX_PROMPT),
        resolution:
            RESOLUCIONES[(params.resolution ?? '').toLowerCase()] ?? '720P',
        duration: Math.min(
            MAX_DUR,
            Math.max(MIN_DUR, Math.floor(params.duration ?? DEFAULT_DUR)),
        ),
        // El audio del modelo es ambiente genérico y NO hace lipsync con la voz
        // del avatar: chocaría con Speak mode, que es el camino real de voz.
        // Apagado a propósito — encenderlo es pagar una pista que se tira.
        audio: false,
        nsfw_checker: false,
    }
    if (params.aspectRatio) input.aspect_ratio = params.aspectRatio

    if (escena === 'references' && refs.length > 0) {
        input.reference_image_urls = refs.slice(0, 10)
    } else if (params.firstFrameUrl) {
        input.first_frame_url = params.firstFrameUrl
        if (params.lastFrameUrl) input.last_frame_url = params.lastFrameUrl
    }
    return input
}
