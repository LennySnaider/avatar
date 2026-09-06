/**
 * Política de contraseñas — UNA sola fuente de verdad.
 *
 * POR QUÉ SE EXTRAE AQUÍ: el mínimo vivía como constante privada dentro de
 * `src/server/actions/user/changePassword.ts`, que es un fichero `'use
 * server'`. En esos ficheros TODO export debe ser async (los `export const`
 * rompen el build, y ni tsc ni eslint lo avisan), así que la constante no se
 * podía compartir: el reset por correo habría acabado con su propio `8`
 * copiado. Dos números que deben ser el mismo y viven en sitios distintos
 * divergen — y el día que uno suba a 12, el otro se queda siendo la puerta
 * ancha por la que se entra.
 *
 * Este módulo NO es `'use server'`: es una constante pura, sin acceso a datos,
 * importable desde server actions, rutas de API y (si algún día hace falta)
 * desde el esquema zod del formulario.
 */

/**
 * Mínimo de longitud, aplicado SIEMPRE en servidor. El zod de los formularios
 * de la plantilla exige `min(1)`, y una validación que sólo vive en el cliente
 * no valida nada: tanto la server action como la ruta de reset son alcanzables
 * sin pasar por el formulario.
 *
 * 8 es el suelo, no el ideal: es el mínimo que recomienda NIST SP 800-63B para
 * secretos elegidos por humanos. Subirlo aquí lo sube en los dos flujos a la
 * vez, que es justo el motivo de que esta constante sea única.
 */
export const MIN_PASSWORD_LENGTH = 8
