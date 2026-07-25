/**
 * Tabla de tallas EU/ES (aportada por el usuario 2026-07-25) — puente cm →
 * talla real. Los MODELOS de difusión no entienden tallas (no aparecen en
 * captions), pero para el USUARIO son el sanity-check instantáneo al mover un
 * slider: "Hips 90cm ≈ XS · 36" dice qué cuerpo real está pidiendo antes de
 * gastar un crédito. Misma tabla que calibra los umbrales de describeBody.
 */
type Zone = 'bust' | 'waist' | 'hips'

const SIZE_ROWS: Array<{
    eu: string
    es: number
    bust: [number, number]
    waist: [number, number]
    hips: [number, number]
}> = [
    { eu: 'XXS', es: 34, bust: [78, 81], waist: [62, 64], hips: [86, 91] },
    { eu: 'XS', es: 36, bust: [82, 85], waist: [65, 67], hips: [92, 96] },
    { eu: 'S', es: 38, bust: [86, 89], waist: [68, 71], hips: [97, 100] },
    { eu: 'M', es: 40, bust: [90, 93], waist: [72, 75], hips: [101, 104] },
    { eu: 'L', es: 42, bust: [94, 97], waist: [76, 79], hips: [105, 107] },
    { eu: 'XL', es: 44, bust: [98, 101], waist: [80, 84], hips: [108, 112] },
    { eu: 'XXL', es: 46, bust: [102, 106], waist: [85, 89], hips: [113, 117] },
    { eu: '3XL', es: 48, bust: [107, 112], waist: [90, 94], hips: [118, 122] },
    { eu: '4XL', es: 50, bust: [113, 118], waist: [95, 99], hips: [123, 127] },
    { eu: '5XL', es: 52, bust: [119, 124], waist: [100, 104], hips: [128, 132] },
    { eu: '6XL', es: 54, bust: [125, 131], waist: [105, 109], hips: [133, 137] },
    { eu: '7XL', es: 56, bust: [132, 136], waist: [110, 115], hips: [138, 142] },
]

/**
 * Talla equivalente para un cm de una zona. Fuera de tabla: "< XXS" (wasp
 * deliberada, p.ej. cintura 45-60) o "> 7XL" (XXL extremo). En los huecos
 * entre rangos se asigna la fila inferior más cercana (≈).
 */
export function sizeLabelFor(zone: Zone, cm?: number | null): string {
    if (!cm || cm <= 0) return ''
    const first = SIZE_ROWS[0][zone]
    const last = SIZE_ROWS[SIZE_ROWS.length - 1][zone]
    if (cm < first[0]) return '≈ < XXS'
    if (cm > last[1]) return '≈ > 7XL (56)'
    let row = SIZE_ROWS[0]
    for (const r of SIZE_ROWS) {
        if (cm >= r[zone][0]) row = r
    }
    return `≈ ${row.eu} · ${row.es}`
}
