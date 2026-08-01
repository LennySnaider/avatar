/**
 * Escena legible a partir del prompt guardado de una generación.
 *
 * POR QUÉ existe: Gemini bloquea en la ENTRADA las imágenes con desnudo con
 * `blockReason: OTHER` — una protección interna de Google que NO se apaga con
 * safetySettings (verificado: BLOCK_NONE y OFF dan el mismo bloqueo, y bloquea
 * hasta con el prompt más neutro; la doc oficial lo llama "built-in protections
 * ... always blocked and cannot be adjusted"). Para esas fotos el caption no
 * puede salir de MIRAR la imagen. Pero no hace falta: la escena YA está escrita
 * en `generations.prompt`, y ese MISMO texto sí lo acepta Gemini.
 *
 * Lo que hay que resolver es que el prompt guardado no es prosa limpia: lleva el
 * harness de identidad. Los tags se tratan distinto según qué contengan —
 * `[CLONE:]/[PLACE:]/[POSE:]/[SCENE:]` guardan DENTRO el outfit y el setting
 * (misma lección que muleRouterPrompt: borrarlos enteros dejaba la escena vacía),
 * mientras que `[BODY:]/[FACE:]` son medidas y cláusulas de identidad que en un
 * caption no pintan nada.
 */

/** Tags cuyo CONTENIDO es la escena — se desenvuelven, no se borran. */
const SCENE_TAGS_RE = /\[(?:CLONE|PLACE|POSE|SCENE):\s*([^\]]*)\]/gi
/** Cualquier otro tag ([BODY:], [FACE:], …) es harness: fuera entero. */
const ANY_TAG_RE = /\[[^\]]*\]/g
/** Prefijo de las generaciones de edición: "Edit (Seedream 5.0 Pro · KIE): …" */
const EDIT_PREFIX_RE = /^\s*Edit\s*\([^)]*\)\s*:\s*/i
const ANTI_WATERMARK_RE = /Do NOT add any watermark[^.]*\./gi
/** Cola de medidas que algunos builders anexan al final. */
const ANATOMY_TAIL_RE = /Her anatomy:[\s\S]*$/i
/** Puntuación/conectores huérfanos que quedan al arrancar un tag inicial. */
const LEADING_JUNK_RE = /^[\s,.;:—-]+/

/**
 * Umbral bajo el cual el texto no describe una foto ("fix finger", "más luz").
 * Escribir un caption desde eso produce ruido, y un caption inventado es peor
 * que decirle al usuario que lo escriba: por debajo de esto devolvemos vacío y
 * el caller avisa en vez de adivinar.
 */
const MIN_USABLE_LENGTH = 15

/**
 * Devuelve la descripción de escena utilizable, o `''` si el prompt no da para
 * una. El caller NUNCA debe rellenar ese vacío con texto inventado.
 */
export function sceneFromGenerationPrompt(prompt?: string | null): string {
    if (!prompt) return ''

    const scene = prompt
        // 1º desenvolver: si no, el barrido de tags se lleva la escena con ellos
        .replace(SCENE_TAGS_RE, ' $1 ')
        .replace(ANY_TAG_RE, ' ')
        .replace(EDIT_PREFIX_RE, '')
        .replace(ANTI_WATERMARK_RE, ' ')
        .replace(ANATOMY_TAIL_RE, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .replace(LEADING_JUNK_RE, '')
        .trim()

    return scene.length >= MIN_USABLE_LENGTH ? scene : ''
}
