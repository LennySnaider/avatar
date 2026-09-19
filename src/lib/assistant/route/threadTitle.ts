/**
 * F5.2 (Estratega) Task 4 — CÓMO SE LLAMA UN HILO NUEVO.
 *
 * El título sale de la primera pregunta del usuario porque es lo único que
 * tenemos en el momento de crear el hilo (pedirle al modelo que lo resuma
 * costaría un turno extra de tokens por conversación, y la lista de hilos de
 * la Task 5 no vale eso).
 *
 * Se lee de las `parts` del `UIMessage` y no de un campo `text`, porque en el
 * AI SDK v6 un mensaje NO tiene texto plano: tiene partes, y sólo algunas son
 * de texto (las demás son ficheros, llamadas a herramientas o marcas de paso).
 *
 * PURO: sin imports. Testeable con `tsx --test`.
 */

/** Tope de caracteres del título. Lo que cabe en la lista de hilos. */
export const THREAD_TITLE_MAX = 60

/** Cuando el primer mensaje no trae texto utilizable (sólo un adjunto). */
export const NEW_THREAD_TITLE = 'Nueva conversación'

/**
 * Título para un hilo nuevo a partir de las `parts` del primer mensaje.
 *
 * `parts` entra como `unknown` a propósito: viene del cuerpo de la petición,
 * y aunque `parseChatBody` ya garantizó que es un array, NO garantizó qué hay
 * dentro. Nunca lanza.
 */
export function deriveThreadTitle(parts: unknown): string {
    if (!Array.isArray(parts)) return NEW_THREAD_TITLE
    const textos: string[] = []
    for (const part of parts) {
        if (typeof part !== 'object' || part === null) continue
        const p = part as { type?: unknown; text?: unknown }
        if (p.type !== 'text' || typeof p.text !== 'string') continue
        textos.push(p.text)
    }
    // Los saltos de línea se colapsan: un título con `\n` rompe la lista y
    // además gasta el presupuesto de 60 caracteres en espacio en blanco.
    const titulo = textos.join(' ').replace(/\s+/g, ' ').trim()
    if (titulo.length === 0) return NEW_THREAD_TITLE
    return titulo.slice(0, THREAD_TITLE_MAX)
}
