/**
 * Reglas PURAS del ajuste de fotos para el feed de Instagram.
 *
 * Instagram (Graph API, feed) solo acepta imágenes con proporción entre 4:5
 * (0.8) y 1.91:1, JPEG, ancho máximo 1440. Upload-Post no expone ningún
 * recorte ni relleno, y una 9:16 (las que salen del Studio) la rellena a 4:5
 * con BLANCO: las franjas laterales que se veían en el post de pilly_of el
 * 2026-09-18. Aquí se decide qué hacer con la imagen antes de mandarla;
 * `instagramFit.ts` (sharp) lo ejecuta. Client-safe: sin IO.
 */

export type InstagramFit = 'pad' | 'crop'

export const DEFAULT_INSTAGRAM_FIT: InstagramFit = 'pad'

export const INSTAGRAM_FIT_OPTIONS: { value: InstagramFit; label: string; description: string }[] = [
    {
        value: 'pad',
        label: 'Blur background',
        description: 'The whole photo, centered over a blurred, darkened copy of itself (4:5).',
    },
    {
        value: 'crop',
        label: 'Crop to 4:5',
        description: 'Trims the top and bottom (or the sides) so the photo fills 4:5.',
    },
]

export const IG_MIN_RATIO = 4 / 5
export const IG_MAX_RATIO = 1.91
export const IG_MAX_WIDTH = 1440
/** Una 1080x1350 exacta es 0.8; con redondeos de otros modelos queda en 0.799 y no hay que tocarla. */
const RATIO_TOLERANCE = 0.005

export function isInstagramFit(value: unknown): value is InstagramFit {
    return value === 'pad' || value === 'crop'
}

export function needsInstagramFit(width: number, height: number): boolean {
    if (!(width > 0) || !(height > 0)) return false
    const ratio = width / height
    return ratio < IG_MIN_RATIO - RATIO_TOLERANCE || ratio > IG_MAX_RATIO + RATIO_TOLERANCE
}

export type InstagramFitPlan =
    | { kind: 'none' }
    | { kind: 'pad'; canvas: { width: number; height: number } }
    | {
          kind: 'crop'
          region: { left: number; top: number; width: number; height: number }
          output: { width: number; height: number }
      }

/** Instagram reescala a 1440 de ancho de todas formas: se hace aquí para no subir megas de más. */
function capWidth(width: number, height: number): { width: number; height: number } {
    if (width <= IG_MAX_WIDTH) return { width, height }
    const scale = IG_MAX_WIDTH / width
    return { width: IG_MAX_WIDTH, height: Math.max(1, Math.round(height * scale)) }
}

export function planInstagramFit(width: number, height: number, fit: InstagramFit): InstagramFitPlan {
    if (!needsInstagramFit(width, height)) return { kind: 'none' }
    const tooTall = width / height < IG_MIN_RATIO
    const target = tooTall ? IG_MIN_RATIO : IG_MAX_RATIO

    if (fit === 'pad') {
        // Se conserva el lado largo entero y se ensancha (o se alarga) el lienzo.
        const canvas = tooTall
            ? { width: Math.ceil(height * target), height }
            : { width, height: Math.ceil(width / target) }
        return { kind: 'pad', canvas: capWidth(canvas.width, canvas.height) }
    }

    // Recorte centrado: se conserva el lado corto entero y se recorta el largo.
    const region = tooTall
        ? (() => {
              const h = Math.floor(width / target)
              return { left: 0, top: Math.floor((height - h) / 2), width, height: h }
          })()
        : (() => {
              const w = Math.floor(height * target)
              return { left: Math.floor((width - w) / 2), top: 0, width: w, height }
          })()
    return { kind: 'crop', region, output: capWidth(region.width, region.height) }
}
