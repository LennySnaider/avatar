/**
 * REFUERZO DE REALISMO (2026-09-22, idea de Lenny). Fichero PURO — lo usan la
 * ruta de Seedream (servidor) y la barra del estudio (cliente, por las
 * etiquetas de los tramos).
 *
 * Seedream sale "demasiado perfecto": piel aerografiada, sin textura. GPT
 * Image 2.5, con el MISMO prompt, da pecas, marcas de bronceado y poros — y
 * por eso se ve más real. Esto es un bloque corto de ESTILO FOTOGRÁFICO que
 * se añade al final del prompt cuando el usuario enciende "✨ Realism" en el
 * estudio (apagado por defecto: sin él, el prompt es byte-idéntico a antes).
 *
 * TRES TRAMOS y no un número: los modelos no entienden "37%", entienden
 * redacciones distintas (mismo criterio que la intensidad del 🌶️). El slider
 * del estudio (0-100) elige tramo. NATURAL es el texto validado en el A/B a
 * ciegas del 22-sep (piel más mate y con textura también en el cuerpo, misma
 * identidad, sin pasarse) y es el valor por defecto.
 *
 * Reglas de redacción, todas ya pagadas en este repo:
 *  - NO nombra rasgos (pecas, lunares, marcas): los motores literales
 *    SATURAN lo que se nombra (pasó con "freckles" y con el pezón, ver
 *    bodyDescriptors). Los rasgos de piel del avatar ya viajan en su ficha
 *    (face_description, tanLines) y son SIEMPRE los mismos; esto sólo pide
 *    que la cámara los muestre como en una foto real, no que invente otros.
 *  - En POSITIVO lo que se quiere (textura, poros, grano); los negativos, en
 *    una sola frase corta al final ("no airbrushing…"), sin enumerar defectos
 *    que el modelo podría pintar.
 *  - Corto (<400 chars): va FUERA del presupuesto de ancla — el ancla de
 *    identidad tiene un techo medido (~2200) por dilución de cara, y esto no
 *    es identidad sino acabado.
 */
export type RealismTier = 'subtle' | 'natural' | 'raw'

/** Posición del slider con que arranca: el centro del tramo NATURAL. */
export const REALISM_DEFAULT_LEVEL = 50

/** Lo que enseña la barra del estudio para cada tramo. */
export const REALISM_TIER_LABEL: Record<RealismTier, string> = {
    subtle: 'Sutil',
    natural: 'Natural',
    raw: 'Crudo',
}

const SUBTLE_CLAUSE =
    'Natural photographic skin: realistic skin texture with fine pores, as in an unretouched photo. Keep her own skin features exactly as they are. No airbrushing, no plastic smoothing.'

/** El texto validado en el A/B del 22-sep. No tocar sin repetir el A/B. */
export const REALISM_CLAUSE =
    'Photographic realism: an unretouched candid photo with natural skin texture — fine pores, subtle natural variation in skin tone and faint vellus hair where the light grazes the skin. Keep her own skin features exactly as they are. Soft natural film grain. No airbrushing, no skin smoothing, no plastic or waxy sheen.'

const RAW_CLAUSE =
    'Raw unretouched photo, like a candid phone snapshot: clearly visible pores and fine skin texture on her face AND body, natural uneven skin tone with faint redness where the skin creases, fine vellus hair, visible natural grain and slight softness. Keep her own skin features exactly as they are. No airbrushing, no beauty filter, no smoothing, no waxy sheen.'

export const REALISM_CLAUSES: Record<RealismTier, string> = {
    subtle: SUBTLE_CLAUSE,
    natural: REALISM_CLAUSE,
    raw: RAW_CLAUSE,
}

/** Slider 0-100 → tramo. Sin nivel (o fuera de rango) = NATURAL. */
export function realismTier(level: number | undefined | null): RealismTier {
    if (typeof level !== 'number' || !Number.isFinite(level)) return 'natural'
    const l = Math.min(100, Math.max(0, level))
    if (l <= 33) return 'subtle'
    if (l <= 66) return 'natural'
    return 'raw'
}

/**
 * Añade el bloque de realismo del tramo al final del prompt si está
 * encendido Y cabe en el límite duro de la API. Si no cabe, se devuelve el
 * prompt tal cual: el acabado nunca se compra recortando escena o identidad.
 */
export function appendRealism(
    prompt: string,
    enabled: boolean | undefined,
    hardLimit: number,
    level?: number | null,
): string {
    if (!enabled) return prompt
    const clause = REALISM_CLAUSES[realismTier(level)]
    const withClause = `${prompt.trimEnd()} ${clause}`
    return withClause.length <= hardLimit ? withClause : prompt
}
