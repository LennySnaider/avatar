import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Tokens de recuperación de contraseña: generación, hasheo y vigencia.
 *
 * Vive fuera de las rutas a propósito. Lo que decide si una cuenta se puede
 * secuestrar no es el `NextResponse` sino estas tres reglas —entropía, hash y
 * caducidad—, y aquí son puras: se pueden probar en memoria, sin base de
 * datos y sin dejar tokens de verdad por medio (ver resetToken.test.ts).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ SHA-256 Y NO EL scrypt DEL PROYECTO
 * ─────────────────────────────────────────────────────────────────────────
 * `hashPassword` (src/lib/auth/password.ts) usa scrypt con N=16384: es LENTO
 * a propósito. Esa lentitud existe para defender secretos de BAJA entropía —
 * una contraseña humana tiene quizá 30 bits, así que hay que encarecer cada
 * intento para que probarlos todos deje de ser gratis.
 *
 * Aquí el secreto lo genera `randomBytes(32)`: 256 bits. No hay diccionario
 * que atacar ni espacio que recorrer; encarecer el intento no compra nada
 * frente a un atacante que ya no puede adivinar. Lo que sí compraría es
 * problemas:
 *
 *  1. scrypt sala ALEATORIAMENTE cada hash. Dos hashes del mismo token son
 *     distintos, así que no se puede indexar ni buscar por el hash: validar un
 *     token exigiría traerse todas las filas vivas y probar scrypt contra cada
 *     una. SHA-256 es determinista → índice único y una consulta O(1).
 *  2. ~100 ms de CPU por validación es una palanca de DoS regalada en un
 *     endpoint público y sin sesión, y ensucia el suelo de tiempo constante
 *     que monta forgot-password.
 *
 * Lo que SÍ hace falta —y SHA-256 lo da— es que el hash sea de un solo
 * sentido: si alguien lee la tabla, se lleva hashes que no puede revertir, no
 * enlaces de reset listos para usar.
 */

/**
 * 32 bytes = 256 bits de aleatoriedad criptográfica. base64url para que el
 * token viaje en una query string sin escapes (`+`, `/` y `=` de base64
 * normal se rompen o se re-codifican al copiar/pegar un enlace).
 */
const TOKEN_BYTES = 32

/**
 * CADUCIDAD: 30 minutos.
 *
 * El porqué del valor, que es un equilibrio entre dos fallos opuestos:
 *  - Demasiado corta (5 min) y el enlace muere antes de llegar: el correo
 *    transaccional tarda de segundos a varios minutos según cola y filtros
 *    del destinatario, y la persona todavía tiene que verlo y abrirlo. Un
 *    reset que caduca de camino se traduce en pedir otro, y otro — más correo,
 *    más tokens vivos y una recuperación que "no funciona".
 *  - Demasiado larga (24 h) y el enlace es una llave olvidada: queda en el
 *    historial del navegador, en la copia de seguridad del buzón, en el correo
 *    reenviado a soporte, y en los escáneres anti-phishing corporativos que
 *    PRE-ABREN los enlaces de los correos entrantes.
 *
 * 30 min cubre con holgura la entrega y la lectura, y deja la ventana de
 * exposición en algo que cabe en una pausa de café.
 */
export const RESET_TOKEN_TTL_MINUTES = 30

/** Lo que hace falta para emitir un token: el claro va al correo, el hash a la base. */
export interface GeneratedResetToken {
    /** Secreto en claro. SÓLO se pone en el enlace del correo; nunca se guarda ni se loguea. */
    token: string
    /** Lo único que se persiste. */
    tokenHash: string
    /** Instante de caducidad, ya calculado. */
    expiresAt: Date
}

/**
 * Hash de un solo sentido del token, en hexadecimal minúscula.
 *
 * Determinista a propósito: es lo que permite BUSCAR la fila por el hash en
 * vez de recorrerlas todas. Sin sal: una sal sólo defiende contra tablas
 * precalculadas, y no existe tabla precalculada de un espacio de 2^256.
 */
export function hashResetToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex')
}

/**
 * Genera un token nuevo junto con su hash y su caducidad.
 *
 * `now` es inyectable para que el test pueda fijar el reloj; en producción no
 * se pasa nunca.
 */
export function generateResetToken(
    now: Date = new Date(),
): GeneratedResetToken {
    const token = randomBytes(TOKEN_BYTES).toString('base64url')
    return {
        token,
        tokenHash: hashResetToken(token),
        expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MINUTES * 60_000),
    }
}

/** Estado de una fila de `password_reset_tokens`, en lo que importa para validar. */
export interface ResetTokenState {
    expiresAt: Date | string
    usedAt: Date | string | null
}

/**
 * ¿Este token todavía sirve? Tres condiciones, todas necesarias:
 *
 *  - No se ha usado. Un token de un solo uso que se puede repetir es un token
 *    permanente: quien vea el enlace una vez (historial, buzón reenviado)
 *    entra cuando quiera, aunque la víctima ya lo haya gastado.
 *  - No ha caducado.
 *  - La caducidad es una fecha válida. Una fecha ilegible NO se trata como
 *    "válido por si acaso": lo que no se puede comprobar se rechaza.
 *
 * Devuelve un booleano seco a propósito: quien llama NO debe poder contarle al
 * usuario cuál de las tres falló (ver el comentario de mensajes genéricos en
 * la ruta de reset-password).
 */
export function isResetTokenUsable(
    state: ResetTokenState,
    now: Date = new Date(),
): boolean {
    if (state.usedAt !== null && state.usedAt !== undefined) return false

    const expiresAt =
        state.expiresAt instanceof Date
            ? state.expiresAt
            : new Date(state.expiresAt)

    if (Number.isNaN(expiresAt.getTime())) return false

    return expiresAt.getTime() > now.getTime()
}

/**
 * Comparación de hashes en tiempo constante.
 *
 * La búsqueda en la base ya se hace por índice (y ahí el tiempo lo marca
 * Postgres, no nosotros), pero cualquier comparación en JS de un secreto
 * derivado se hace así por costumbre defensiva: `===` sobre strings corta en
 * el primer byte distinto y filtra, byte a byte, cuánto acertaste.
 */
export function resetTokenHashEquals(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8')
    const bufB = Buffer.from(b, 'utf8')
    if (bufA.length !== bufB.length) return false
    return timingSafeEqual(bufA, bufB)
}
