/**
 * Rutas del objeto limpio en R2. Modulo PURO: sin red, sin Supabase, sin env.
 *
 * POR QUE UNA RUTA NUEVA Y NO SOBRESCRIBIR: los objetos se suben con
 * `IMMUTABLE_CACHE` (`src/lib/mediaStore.ts`), asi que la CDN y el navegador
 * pueden servir el original durante un año aunque el byte haya cambiado.
 * Reescribir la misma clave daria un limpiado que sigue viendose sucio.
 *
 * POR QUE EN LA MISMA CARPETA: `orgOwnsStoragePath` (`src/lib/storagePaths.ts`)
 * valida la pertenencia por prefijo `org/{id}/`, y los scripts de purga barren
 * por carpeta. Un sufijo conserva las dos cosas; una carpeta aparte las rompe.
 */

/** Extensiones que el motor sabe abrir. Lo demas se salta, no se intenta. */
const EXTENSIONES_LIMPIABLES = new Set([
    'png',
    'jpg',
    'jpeg',
    'webp',
    'mp4',
])

/** Sufijo que marca el objeto ya limpiado. */
const SUFIJO = '.clean'

function partirExtension(ruta: string): { base: string; ext: string } {
    const barra = ruta.lastIndexOf('/')
    const punto = ruta.lastIndexOf('.')
    if (punto <= barra) return { base: ruta, ext: '' }
    return { base: ruta.slice(0, punto), ext: ruta.slice(punto + 1) }
}

/** `true` si el motor puede abrir este archivo por su extension. */
export function esLimpiable(ruta: string): boolean {
    const { ext } = partirExtension(ruta)
    return EXTENSIONES_LIMPIABLES.has(ext.toLowerCase())
}

/** `true` si la ruta YA es la de un objeto limpiado. */
export function esRutaLimpia(ruta: string): boolean {
    const { base } = partirExtension(ruta)
    return base.endsWith(SUFIJO)
}

/**
 * Ruta del objeto limpio para un original.
 *
 * Es DETERMINISTA a proposito: un reintento vuelve a escribir la misma clave,
 * que nunca se ha servido a nadie, en vez de dejar un objeto huerfano por cada
 * intento fallido. Y es IDEMPOTENTE: aplicarla a una ruta ya limpia la deja
 * igual, para que un re-proceso no genere `x.clean.clean.png`.
 */
export function rutaLimpia(rutaOriginal: string): string {
    if (esRutaLimpia(rutaOriginal)) return rutaOriginal
    const { base, ext } = partirExtension(rutaOriginal)
    return ext ? `${base}${SUFIJO}.${ext}` : `${base}${SUFIJO}`
}

/**
 * Ruta de la miniatura de un objeto.
 *
 * Replica el formato que ya usa `apiCreateThumbnailUploadTicket`
 * (`src/services/AvatarForgeService.ts`): `thumbs/<ruta original>.jpg`. Se
 * repite aqui en vez de importarse porque aquel vive en un modulo
 * `'use server'` y este tiene que poder correr en una prueba unitaria.
 */
export function rutaMiniatura(rutaObjeto: string): string {
    return `thumbs/${rutaObjeto}.jpg`
}
