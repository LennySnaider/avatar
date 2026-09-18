/**
 * Aspect ratio efectivo para Seedance 2.5 (KIE). PURO: sin red ni Supabase,
 * para poder probar la regla sin gastar créditos.
 *
 * Contrato de KIE (createTask devolvía 422 el 2026-09-18):
 *   "Seedance 2.5 first-frame and first-last-frame tasks only support
 *    adaptive aspect ratio"
 * Es decir: cuando la petición lleva `first_frame_url` (con o sin
 * `last_frame_url`), el ÚNICO valor aceptado es 'adaptive' — el clip hereda
 * la proporción de la imagen. El selector del Studio (1:1, 9:16…) sólo manda
 * en text-to-video y en el modo de referencias (`reference_image_urls`).
 *
 * Valores que documenta la API (docs.kie.ai/market/bytedance/seedance-2-5):
 * 1:1, 4:3, 3:4, 16:9, 9:16, 21:9 y 'adaptive' (su default). Un valor fuera
 * de la lista cae en 'adaptive' en vez de viajar y provocar otro 422.
 */

export const SEEDANCE_25_ADAPTIVE = 'adaptive'

export const SEEDANCE_25_ASPECT_RATIOS: ReadonlySet<string> = new Set([
    '1:1',
    '4:3',
    '3:4',
    '16:9',
    '9:16',
    '21:9',
    SEEDANCE_25_ADAPTIVE,
])

export function seedance25AspectRatio(opts: {
    /** Lo que pidió el usuario (selector del Studio). Puede venir vacío. */
    requested?: string
    /** true si el submit lleva `first_frame_url` (first-frame o first+last). */
    hasFirstFrame: boolean
}): string {
    if (opts.hasFirstFrame) return SEEDANCE_25_ADAPTIVE
    const requested = opts.requested?.trim()
    if (requested && SEEDANCE_25_ASPECT_RATIOS.has(requested)) return requested
    return SEEDANCE_25_ADAPTIVE
}
