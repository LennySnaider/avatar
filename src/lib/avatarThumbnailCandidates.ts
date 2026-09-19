/**
 * Candidatos de miniatura de un avatar, EN ORDEN — puro, sin DOM ni red.
 *
 * Reporte 2026-09-19: "el thumbnail que se debe ver es el de la cara frontal,
 * no el de los ángulos". Y era verdad: el selector ofrecía
 * `[...caras, ...ángulos, ...generales]` en una sola lista y su `<img>`
 * AVANZA al siguiente candidato en `onError` (eso nació el 27-jul para la
 * ventana del trasplante, donde una fila vieja no tenía bytes y 404eaba). Con
 * las dos cosas juntas, cualquier fallo de la cara —un 404, o una entrada de
 * caché envenenada sin CORS, que en este proyecto ya van cuatro— degradaba en
 * silencio a la HOJA DE ÁNGULOS: una imagen distinta, plausible, y sin ninguna
 * señal de que la buena no había cargado.
 *
 * La regla ahora es GRUPO, no lista plana: se devuelve el primer tipo que
 * tenga filas, nunca una mezcla. Si el avatar tiene cara, los candidatos son
 * SUS CARAS y ninguna otra cosa; si todas fallan se cae al hueco (iniciales o
 * icono), que dice la verdad — "esta cara no carga" — en vez de disimular con
 * otra referencia. El avance entre filas del MISMO tipo se conserva, que es
 * para lo que se creó: varias caras, la nueva con bytes y la vieja sin ellos.
 */

export interface ThumbnailRef {
    type: string
    storage_path: string | null
    storage_provider?: string | null
    created_at?: string | null
}

/** Orden de preferencia entre TIPOS. Sólo se usa el primero que tenga filas. */
export const THUMBNAIL_TYPE_PRIORITY = ['face', 'angle', 'general'] as const

/** Más nuevas primero: en la ventana del trasplante la re-subida es la que
 *  tiene bytes y la fila vieja 404ea. */
const byNewest = (a: ThumbnailRef, b: ThumbnailRef) =>
    (b.created_at ?? '').localeCompare(a.created_at ?? '')

/**
 * Filas candidatas, ya ordenadas. Devuelve SÓLO las del primer tipo con
 * contenido — nunca mezcla tipos (ver cabecera).
 */
export function pickThumbnailRefs(
    refs: readonly ThumbnailRef[] | null | undefined,
): ThumbnailRef[] {
    if (!refs?.length) return []
    for (const type of THUMBNAIL_TYPE_PRIORITY) {
        const group = refs
            .filter((r) => r.type === type && r.storage_path)
            .sort(byNewest)
        if (group.length > 0) return group
    }
    return []
}

/**
 * Lo mismo, ya resuelto a URLs. `toUrl` se inyecta para que este módulo no
 * dependa de `storagePaths` (ni de sus `process.env`) y siga siendo probable
 * sin navegador.
 */
export function buildThumbnailCandidates(
    refs: readonly ThumbnailRef[] | null | undefined,
    toUrl: (path: string, provider?: string | null) => string,
): string[] {
    return pickThumbnailRefs(refs).map((r) =>
        toUrl(r.storage_path as string, r.storage_provider),
    )
}
