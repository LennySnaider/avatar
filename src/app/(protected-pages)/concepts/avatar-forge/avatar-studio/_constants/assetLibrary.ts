/**
 * Assets guardados: los objetos recurrentes del personaje (su teléfono, un
 * bolso, un conjunto concreto).
 *
 * Mismo trato que los lugares — se describen una vez, se guardan y se eligen
 * cuando la foto los pide. La diferencia con un place es de forma: un lugar es
 * una enumeración por comas y un objeto es una frase corta, así que el nombre
 * se deriva distinto.
 */

/** Categoría con la que se guardan en la tabla `prompts`. */
export const ASSET_PROMPT_CATEGORY = 'asset'

/** Artículos y rellenos que no aportan nada a un nombre de dos palabras. */
const STOPWORDS = new Set([
    'a',
    'an',
    'the',
    'with',
    'and',
    'in',
    'on',
    'of',
    'small',
    'large',
])

/**
 * Nombre legible a partir de la descripción del objeto.
 *
 * "a rose-gold smartphone in a clear glitter case…" → "Rose-gold smartphone".
 * Se descartan artículos y rellenos por delante para no acabar con nombres como
 * "A small" — que entre diez assets guardados no distinguen nada.
 */
export function assetNameFromText(text: string): string {
    const words = text
        .trim()
        .replace(/[.,;:]+$/g, '')
        .split(/\s+/)
        .filter(Boolean)

    // Se saltan los rellenos SOLO al principio: en medio pueden ser parte del
    // nombre real ("bag of pearls").
    let start = 0
    while (start < words.length && STOPWORDS.has(words[start].toLowerCase())) {
        start++
    }
    const picked = words.slice(start, start + 3)
    if (picked.length === 0) return 'Asset'

    const name = picked.join(' ')
    const titled = name.charAt(0).toUpperCase() + name.slice(1)
    return titled.length > 40 ? `${titled.slice(0, 39).trimEnd()}…` : titled
}
