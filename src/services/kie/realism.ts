/**
 * REFUERZO DE REALISMO (2026-09-22, idea de Lenny). Fichero PURO.
 *
 * Seedream sale "demasiado perfecto": piel aerografiada, sin textura. GPT
 * Image 2.5, con el MISMO prompt, da pecas, marcas de bronceado y poros — y
 * por eso se ve más real. Esto es un bloque corto de ESTILO FOTOGRÁFICO que
 * se añade al final del prompt cuando el usuario enciende "✨ Realism" en el
 * estudio (apagado por defecto: sin él, el prompt es byte-idéntico a antes).
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
 *  - Corto (~330 chars): va FUERA del presupuesto de ancla — el ancla de
 *    identidad tiene un techo medido (~2200) por dilución de cara, y esto no
 *    es identidad sino acabado.
 */
export const REALISM_CLAUSE =
    'Photographic realism: an unretouched candid photo with natural skin texture — fine pores, subtle natural variation in skin tone and faint vellus hair where the light grazes the skin. Keep her own skin features exactly as they are. Soft natural film grain. No airbrushing, no skin smoothing, no plastic or waxy sheen.'

/**
 * Añade el bloque de realismo al final del prompt si está encendido Y cabe
 * en el límite duro de la API. Si no cabe, se devuelve el prompt tal cual:
 * el acabado nunca se compra recortando la escena o la identidad.
 */
export function appendRealism(
    prompt: string,
    enabled: boolean | undefined,
    hardLimit: number,
): string {
    if (!enabled) return prompt
    const withClause = `${prompt.trimEnd()} ${REALISM_CLAUSE}`
    return withClause.length <= hardLimit ? withClause : prompt
}
