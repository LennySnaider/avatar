/**
 * Regla del NOMBRE VISIBLE — una sola fuente de verdad.
 *
 * POR QUE VIVE AQUI Y NO DENTRO DE LA SERVER ACTION: la accion que guarda es
 * un fichero `'use server'`, y ahi TODO export debe ser async (un
 * `export const MAX...` rompe el build y ni tsc ni eslint lo avisan). Si el
 * limite viviera dentro, el formulario tendria que copiar el numero — y dos
 * constantes que deben ser iguales viviendo separadas divergen. Mismo criterio
 * que `@/lib/auth/passwordPolicy`.
 *
 * Este modulo es PURO (sin sesion, sin base de datos), asi que lo importan a la
 * vez el esquema zod del formulario, la server action y el test de node:test.
 */

/**
 * Tope de longitud. No lo impone la base — `users.name` es `text`, sin limite —
 * lo impone la pantalla: ese nombre se pinta en la cabecera y en el menu de
 * usuario, y un valor de 10.000 caracteres no es un nombre, es una forma de
 * romper el layout (o de guardar un texto arbitrario en un campo que se
 * renderiza en todas las paginas). 80 caracteres dan de sobra para un nombre
 * completo real.
 *
 * Se mide en unidades UTF-16 (`String.prototype.length`), que es lo que cuenta
 * JavaScript: un emoji o un caracter fuera del BMP gasta 2. Es un tope de
 * presentacion, no una cuota — la imprecision no tiene consecuencia.
 */
export const MAX_DISPLAY_NAME_LENGTH = 80

export type DisplayNameCheck =
    | { ok: true; value: string }
    | { ok: false; message: string }

/**
 * Caracteres de control C0 y C1 (\u0000-\u001F, \u007F-\u009F) MENOS los tres
 * que son espacio en blanco: tabulador (\u0009), salto de linea (\u000A) y
 * retorno de carro (\u000D).
 *
 * POR QUE SE QUITAN LOS DEMAS: no son visibles pero si se guardan. Un nombre
 * con un NUL dentro entra tal cual en la cabecera y en el menu de usuario,
 * donde no hay forma de verlo ni de corregirlo — el usuario veria su nombre
 * "bien" en el formulario y la app lo pintaria raro en todas las demas
 * pantallas.
 *
 * POR QUE SE EXCLUYEN LOS TRES DE ESPACIADO: borrarlos PEGARIA las palabras
 * ("Lenny\nSnaiderman" -> "LennySnaiderman"). Esos tres no se borran, se
 * colapsan a un espacio en el paso siguiente, que es lo que espera quien pega
 * un nombre desde un documento.
 */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g

/**
 * Deja el nombre como se va a guardar: sin caracteres de control, con los
 * espacios colapsados y recortado.
 *
 * EL ORDEN IMPORTA: primero se borran los invisibles y despues se colapsan los
 * espacios. Al reves, un `"a\u0000 b"` acabaria con dos espacios seguidos
 * porque el colapso ya habria pasado cuando se borra el caracter de en medio.
 *
 * POR QUE SE COLAPSAN LOS ESPACIOS: `"Lenny   Snaiderman"` y
 * `"Lenny Snaiderman"` son el mismo nombre; guardarlos como distintos solo
 * sirve para que la pantalla enseñe algo que el usuario no escribio a
 * proposito. El `\s` cubre tabuladores, saltos de linea y el espacio duro
 * (`\u00A0`), que es lo que llega al pegar desde un documento.
 */
export function normalizeDisplayName(raw: string): string {
    return raw.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim()
}

/**
 * Valida y normaliza en un solo paso: devuelve el valor EXACTO que hay que
 * guardar, o el mensaje que hay que enseñar. Van juntos a proposito — si
 * validar y normalizar fueran dos llamadas separadas, seria posible validar una
 * cadena y guardar otra.
 *
 * Acepta `unknown` porque el llamador de verdad es una server action, es decir
 * un endpoint HTTP: sus argumentos los pone quien llama, no el formulario, y
 * `undefined` o un numero son entradas perfectamente posibles.
 */
export function checkDisplayName(raw: unknown): DisplayNameCheck {
    if (typeof raw !== 'string') {
        return { ok: false, message: 'Please enter your name.' }
    }

    const value = normalizeDisplayName(raw)

    if (!value) {
        // Cubre a la vez la cadena vacia y la que solo traia espacios o
        // caracteres invisibles: despues de normalizar son el mismo caso.
        return { ok: false, message: 'Please enter your name.' }
    }

    if (value.length > MAX_DISPLAY_NAME_LENGTH) {
        return {
            ok: false,
            message: `Your name must be at most ${MAX_DISPLAY_NAME_LENGTH} characters long.`,
        }
    }

    return { ok: true, value }
}
