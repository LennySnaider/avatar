/**
 * Elegir UNA fila entre varias del mismo tipo de referencia (hoja `body`,
 * `body_nsfw`, cara...).
 *
 * `apiGetAvatarReferences` ordena ASCENDENTE por `created_at` (así nació en
 * enero y AvatarSelector depende de ese orden: recorre todas y "la última
 * gana"). Dos lectores del Body Lab hacían `rows[0]` creyendo tomar "la última
 * guardada" y tomaban la MÁS VIEJA. Mientras hubo una sola fila por tipo no se
 * notó; cuando el rescate del 13-sep re-insertó las hojas del 26-jul, 10
 * avatares pasaron a generar con su hoja vieja — la de MiaUltra, mal generada
 * (top transparente), salía "topless" con 🌶️ apagado (reporte 2026-09-19).
 *
 * La regla vive aquí para que NO dependa del orden de la consulta: se elige
 * por fecha, venga como venga.
 */
export function newestReference<T extends { created_at: string | null }>(
    rows: readonly T[] | null | undefined,
): T | undefined {
    if (!rows?.length) return undefined
    return rows.reduce((best, row) => {
        const a = row.created_at ? Date.parse(row.created_at) : Number.NEGATIVE_INFINITY
        const b = best.created_at ? Date.parse(best.created_at) : Number.NEGATIVE_INFINITY
        return a > b ? row : best
    })
}
