/**
 * Cómo viaja al servidor una referencia del Body Lab.
 *
 * Módulo PURO a propósito (sin Supabase ni KIE detrás): `bodySheetGenerate`
 * arrastra media infraestructura y no se puede testear aislado, y estas reglas
 * nacieron de un fallo en producción que merece quedar cubierto.
 *
 * EL FALLO: la plantilla de turnaround (1,88 MB → ~2,5 MB en base64) y, luego,
 * la hoja nude recién generada (varios MB a 2K) se mandaban como BYTES en el
 * cuerpo de la server action. Eso revienta el tope de Vercel con un
 * `413 Content Too Large` y deja el Body Lab sin poder generar. Yendo por URL,
 * el proveedor las descarga él mismo y el cuerpo de la petición queda en nada.
 */

/** Una referencia para la hoja: o ya está hospedada (`url`) o son bytes. */
export type SheetRef = { base64?: string; mimeType: string; url?: string }

/** Origen de la página, o '' en servidor. */
export const origenPublico = () =>
    typeof window !== 'undefined' ? window.location.origin : ''

/**
 * ¿El proveedor podrá descargar de aquí? De `localhost` no puede, así que en
 * desarrollo hay que seguir mandando los bytes aunque pesen.
 */
export const esUrlPublica = (origen: string) =>
    /^https:\/\//.test(origen) && !/localhost|127\.0\.0\.1/.test(origen)

/**
 * Content-Type por la extensión. Solo para cumplir el contrato de la ref:
 * cuando va por `url`, el proveedor descarga el archivo y lee el suyo.
 */
export const tipoPorExtension = (url: string): string =>
    /\.jpe?g(\?|$)/i.test(url) ? 'image/jpeg' : 'image/png'
