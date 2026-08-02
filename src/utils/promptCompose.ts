/**
 * Inserta texto (una pose, una acción) ANTES del bloque de cámara del prompt.
 *
 * POR QUÉ no se concatena al final: el presupuesto de prompt recorta por la
 * COLA. Los chips de estilo ya murieron así una vez — iban al final y "los
 * truncaba el presupuesto y morían en silencio" (d5fb69e). Una pose pegada
 * detrás de "…85mm, shallow depth of field" corre exactamente el mismo riesgo,
 * y además queda descolgada de la descripción del cuerpo, que es donde el
 * modelo la espera.
 *
 * La convención de la librería es que el bloque de cámara/luz/mood cierra el
 * prompt, así que basta con encontrar dónde empieza y colocarse justo delante.
 */

/**
 * Marcadores de que una frase ya es del bloque técnico. Deliberadamente
 * conservador: si no encuentra ninguno, el texto se añade al final — que es el
 * comportamiento de antes, nunca peor.
 */
const CAMERA_RE =
    /\b(\d{2,3}\s*mm|lens|shot|close-up|continuous take|push-in|dolly|angle|depth of field|framing|bokeh)\b/i

/** Corta en frases conservando el punto de cada una. */
function toSentences(text: string): string[] {
    return text
        .split(/(?<=\.)\s+/)
        .map((s) => s.trim())
        .filter(Boolean)
}

export function insertBeforeCameraBlock(
    prompt: string,
    addition: string,
): string {
    const add = addition.trim().replace(/\.+$/, '')
    if (!add) return prompt
    const base = prompt.trim()
    if (!base) return `${add}.`

    const sentences = toSentences(base)
    const cameraIdx = sentences.findIndex((s) => CAMERA_RE.test(s))

    const piece = `${add}.`
    if (cameraIdx === -1) {
        // Sin bloque de cámara: al final, como siempre.
        const head = base.replace(/\.+$/, '')
        return `${head}. ${piece}`
    }

    sentences.splice(cameraIdx, 0, piece)
    return sentences.join(' ').replace(/\s{2,}/g, ' ')
}
