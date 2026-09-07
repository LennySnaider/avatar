/**
 * Regla de invalidacion de sesiones por cambio de contrasena — LOGICA PURA.
 *
 * Este modulo NO importa nada: ni la base, ni NextAuth, ni Node. Es a proposito.
 * Todo lo que se puede equivocar aqui es una comparacion de dos instantes, y una
 * comparacion de instantes se prueba en memoria (ver sessionRevocation.test.ts).
 * Los errores que se cuelan en este tipo de codigo son siempre los mismos tres:
 * el signo al reves, la zona horaria comida al parsear, y el caso "todavia no
 * hay marca" tratado como "revocar". Los tres tienen prueba.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUE SE COMPARA CON QUE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  - `passwordChangedAt`: columna `users.password_changed_at`, escrita por los
 *    dos caminos de cambio de contrasena. NULL = nunca cambiada desde que existe
 *    la columna.
 *
 *  - `sessionStartedAt`: claim propio que src/auth.ts sella en el JWT en el
 *    momento del login (`Date.now()` en milisegundos).
 *
 * POR QUE UN CLAIM PROPIO Y NO EL `iat` ESTANDAR DEL JWT: porque `iat` NO es el
 * instante en que empezo la sesion. Auth.js re-firma la cookie en cada lectura
 * de sesion y su `encode` llama a `.setIssuedAt()` cada vez (verificado en
 * node_modules/@auth/core/jwt.js, linea 57), asi que `iat` avanza solo con que
 * el navegador siga usando la app. Un intruso activo tendria `iat` siempre
 * fresco y no se le expulsaria NUNCA. El claim propio se escribe una sola vez,
 * en el login, y sobrevive intacto a todas las re-firmas.
 *
 * Un token viejo (emitido antes de este cambio) no lleva el claim. Ese caso NO
 * revoca: ver `isSessionRevoked`.
 */

/**
 * Cuanto vale una lectura cacheada de `password_changed_at` antes de releerla.
 *
 * ES EL PRECIO DE LA EXPULSION: el callback `jwt` corre en cada `auth()` (41
 * llamadas en el arbol de esta app), asi que consultar la base en cada pasada
 * seria una lectura por request autenticada. Con esta ventana, la expulsion
 * tarda como mucho 30 segundos en hacerse efectiva en una instancia que ya
 * tuviera al usuario en cache (0 segundos en la instancia que escribio el
 * cambio, que siembra su propia cache), y el coste baja a como mucho 2 lecturas
 * por usuario activo y por minuto por instancia caliente.
 *
 * Vive AQUI, en el modulo puro, para que el numero que documenta la latencia de
 * la expulsion y el numero que la implementa sean el mismo.
 */
export const REVOCATION_CACHE_TTL_MS = 30_000

/**
 * Margen a favor del token al comparar los dos instantes.
 *
 * POR QUE HACE FALTA: los dos instantes los escriben procesos distintos con
 * relojes distintos (`Date.now()` de la instancia que atendio el login vs
 * `Date.now()` de la que atendio el cambio). La secuencia peligrosa es
 * "cambio la contrasena → entro con la nueva": si el reloj de la instancia que
 * escribio la marca va adelantado respecto al de la que atiende el login, la
 * sesion RECIEN creada parece anterior al cambio y se revoca al instante. El
 * usuario no entra "mal": no entra NUNCA, en bucle, con la contrasena correcta.
 * Eso es infinitamente peor que el riesgo que este margen concede.
 *
 * QUE CONCEDE: un token creado en los 5 segundos anteriores al cambio sobrevive.
 * Para que eso beneficie a un intruso tendria que haber iniciado sesion dentro
 * de esa ventana de 5 segundos — y si acaba de entrar, la contrasena vieja ya la
 * tenia; el reset le quita la llave igual. El escenario real (intruso dentro
 * desde hace horas o dias) queda cubierto entero.
 */
export const CLOCK_SKEW_TOLERANCE_MS = 5_000

/**
 * Convierte a milisegundos lo que devuelve la base (`timestamptz` serializado
 * por PostgREST, p.ej. "2026-09-06T18:30:00.123+00:00") o lo que trae el claim
 * del token (un numero).
 *
 * Devuelve `null` para todo lo que no sea un instante util: NULL de la columna,
 * cadena vacia, fecha impresentable, NaN, Infinity, numeros <= 0.
 *
 * POR QUE `Date.parse` Y NO TROCEAR LA CADENA A MANO: `Date.parse` respeta el
 * desplazamiento horario del ISO-8601, asi que "...+02:00" y su equivalente en
 * "Z" dan el MISMO numero. Cualquier parseo casero (cortar por la T, quedarse
 * con los primeros 19 caracteres) se come el huso y desplaza el instante horas
 * enteras — que en esta comparacion significa expulsar a quien no toca o dejar
 * dentro a quien menos conviene. Hay prueba de esto.
 *
 * `null` en vez de excepcion: quien llama es un callback de sesion, y ahi lo
 * unico que no puede pasar es tumbar la sesion de alguien por un dato raro.
 */
export function toEpochMs(value: unknown): number | null {
    if (typeof value === 'number') {
        return Number.isFinite(value) && value > 0 ? value : null
    }
    if (typeof value === 'string') {
        const trimmed = value.trim()
        if (!trimmed) return null
        const parsed = Date.parse(trimmed)
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null
    }
    if (value instanceof Date) {
        const ms = value.getTime()
        return Number.isFinite(ms) && ms > 0 ? ms : null
    }
    return null
}

export interface SessionRevocationInput {
    /** Claim `sessionStartedAt` del JWT (ms). Ausente en tokens anteriores a este cambio. */
    sessionStartedAt: unknown
    /** `users.password_changed_at` tal cual viene de la base. NULL si nunca se cambio. */
    passwordChangedAt: unknown
}

/**
 * ¿Hay que cerrar esta sesion?
 *
 * `true` SOLO cuando consta que la sesion empezo antes del cambio de contrasena
 * con margen suficiente. En todos los demas casos `false`, y eso es deliberado:
 *
 *  - Sin marca de cambio (NULL) no hay nada que invalidar. Es el estado de todas
 *    las filas justo despues de aplicar la migracion, y por eso aplicarla no
 *    echa a nadie.
 *  - Sin claim `sessionStartedAt` (token emitido antes de este commit) no se
 *    puede saber si la sesion es anterior o posterior al cambio. Se deja pasar:
 *    esos tokens caducan solos, y la alternativa —revocarlos— habria expulsado a
 *    todo el mundo en el despliegue, que es justo lo que no se quiere.
 *  - Con cualquiera de los dos valores ilegible, tampoco se revoca. Un dato mal
 *    formado es un fallo nuestro, no una sospecha sobre el usuario.
 *
 * La comparacion es ESTRICTA y con margen: se revoca solo si
 * `sessionStartedAt + margen < passwordChangedAt`. Empatar no revoca.
 */
export function isSessionRevoked({
    sessionStartedAt,
    passwordChangedAt,
}: SessionRevocationInput): boolean {
    const changedMs = toEpochMs(passwordChangedAt)
    if (changedMs === null) return false

    const startedMs = toEpochMs(sessionStartedAt)
    if (startedMs === null) return false

    return startedMs + CLOCK_SKEW_TOLERANCE_MS < changedMs
}
