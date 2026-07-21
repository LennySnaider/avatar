import type { BodyShape, PhysicalMeasurements } from '@/@types/supabase'

/** Orden de despliegue en la UI. */
export const BODY_SHAPES: BodyShape[] = [
    'hourglass',
    'pear',
    'apple',
    'rectangle',
    'inverted-triangle',
    'spoon',
    'diamond',
]

export const SHAPE_LABEL: Record<BodyShape, string> = {
    hourglass: 'Hourglass',
    pear: 'Pear',
    apple: 'Apple',
    rectangle: 'Rectangle',
    'inverted-triangle': 'Inverted △',
    spoon: 'Spoon',
    diamond: 'Diamond',
}

/**
 * Ejemplo CANÓNICO de cada forma (cm). Seleccionar una forma pre-carga estos
 * valores en los sliders (punto de partida); luego el usuario ajusta. Solo
 * setean el esqueleto (hombros/busto/cintura/cadera) — no los niveles de curva.
 */
export const SHAPE_PRESETS: Record<
    BodyShape,
    Pick<PhysicalMeasurements, 'shoulders' | 'bust' | 'waist' | 'hips'>
> = {
    hourglass: { shoulders: 95, bust: 95, waist: 63, hips: 96 },
    pear: { shoulders: 88, bust: 88, waist: 68, hips: 106 },
    apple: { shoulders: 96, bust: 100, waist: 88, hips: 95 },
    rectangle: { shoulders: 90, bust: 90, waist: 80, hips: 92 },
    'inverted-triangle': { shoulders: 102, bust: 96, waist: 72, hips: 90 },
    spoon: { shoulders: 88, bust: 90, waist: 70, hips: 112 },
    diamond: { shoulders: 84, bust: 90, waist: 86, hips: 90 },
}

/**
 * Deriva la forma de las medidas actuales (para avatares viejos sin `shape` y
 * para respetar ajustes manuales). Heurística por ratios; los hombros caen a
 * `bust` si no están seteados.
 */
export function deriveShapeFromMeasurements(m: PhysicalMeasurements): BodyShape {
    const sh = m.shoulders ?? m.bust
    const { bust: b, waist: w, hips: h } = m
    if (!b || !w || !h) return 'hourglass'
    const definedWaist = w <= Math.min(b, h) * 0.8 // cintura marcada

    if (sh > h * 1.05 && b >= h) return 'inverted-triangle'
    if (h > sh * 1.05 && h > b * 1.03) {
        if (h > sh * 1.18 && definedWaist) return 'spoon'
        return 'pear'
    }
    if (definedWaist && Math.abs(sh - h) <= Math.max(sh, h) * 0.06) {
        return 'hourglass'
    }
    if (w >= b * 0.92 && w >= h * 0.92) {
        return sh < h * 0.95 && b < h * 0.98 ? 'diamond' : 'apple'
    }
    return 'rectangle'
}
