/**
 * Huellas para detectar "hay cambios sin guardar" en los editores de avatar.
 *
 * POR QUÉ HUELLAS Y NO COMPARAR OBJETOS: las referencias llevan la imagen
 * entera en `base64`. Un deep-equal sobre eso compara megabytes en cada render
 * y, peor, da falsos positivos en cuanto algo re-serializa los bytes. Lo que
 * identifica a una imagen es de dónde salió, no su contenido.
 */

/**
 * Identidad de una referencia: su ruta en storage si ya se persistió, y si no
 * su `id`.
 *
 * El `id` es un `crypto.randomUUID()` nuevo en cada subida o generación, así
 * que cambia exactamente cuando la imagen cambia. Y la limpieza de marca de
 * agua (que corre ~15s en segundo plano) CONSERVA el id al reemplazar los
 * bytes, así que no marca el formulario como sucio por su cuenta.
 */
export const refKey = (
    r?: { id?: string; storagePath?: string } | null,
): string => (r ? (r.storagePath ?? r.id ?? '?') : '-')

/**
 * Una referencia SIN `storagePath` nunca se persistió: o se acaba de generar o
 * se acaba de subir. Es la señal exacta de "esto se pierde si sales ahora", y
 * la única que sobrevive al auto-fijado del Body Lab (que escribe la hoja al
 * store ANTES de guardar, así que comparar contra el store no serviría).
 */
export const isUnpersistedRef = (
    r?: { storagePath?: string } | null,
): boolean => !!r && !r.storagePath

/**
 * Serializa las medidas con las claves ORDENADAS.
 *
 * No es cosmético: `PhysicalAttributesEditor` y `AppearanceEditor` construyen
 * el objeto con distinto orden de inserción, `JSON.stringify` respeta ese
 * orden, y sin ordenar el mismo cuerpo produce dos cadenas distintas — todo
 * avatar saldría "modificado" con solo abrir el editor.
 */
export const measuresKey = (m: object | null | undefined): string =>
    m ? JSON.stringify(m, Object.keys(m).sort()) : '-'

/** Huella estable de un objeto plano ya reducido a valores primitivos. */
export const fingerprint = (parts: Record<string, unknown>): string =>
    JSON.stringify(parts, Object.keys(parts).sort())
