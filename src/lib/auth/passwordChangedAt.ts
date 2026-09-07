import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase'
import { REVOCATION_CACHE_TTL_MS } from './sessionRevocation'

/**
 * Lectura CACHEADA de `users.password_changed_at`, la marca que invalida las
 * sesiones anteriores a un cambio de contrasena.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE HAY CACHE (el problema que resuelve)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * El callback `jwt` de src/auth.ts corre en CADA lectura de sesion: cada
 * `auth()` de un server component, de una server action o de una ruta de API —
 * 41 puntos de llamada en este arbol, varios de ellos en la misma pintada de
 * pagina. Poner ahi una consulta a Postgres sin mas es poner una lectura de base
 * a cada request autenticada de la app, que es exactamente el coste que se
 * ahorraba usando sesiones JWT sin adapter. No consultar nunca es no tener
 * invalidacion. El punto medio es esta cache con ventana corta.
 *
 * CUENTAS: con `REVOCATION_CACHE_TTL_MS` = 30 s, un usuario activo genera como
 * mucho 2 lecturas por minuto por instancia caliente (120/hora) en vez de una
 * por request; y la expulsion tarda como mucho esos 30 s en hacerse efectiva —
 * 0 s en la instancia que atendio el cambio, porque esa siembra su propia cache
 * con `rememberPasswordChangedAt`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE LA CACHE VIVE EN MEMORIA DEL PROCESO Y NO DENTRO DEL TOKEN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * La tentacion es guardar "ya lo comprobe a las X" como un claim mas del JWT y
 * ahorrarse hasta el mapa. No sirve: el token solo se vuelve a escribir en la
 * cookie cuando la respuesta puede poner cookies, y un `auth()` desde un server
 * component NO puede. En ese camino —el mas frecuente— la marca de "ya
 * comprobado" no persistiria y la cache degradaria a una lectura por request sin
 * avisar. La memoria del proceso no depende de eso.
 *
 * El precio de que sea por proceso: en serverless cada instancia caliente tiene
 * la suya, asi que el techo real de lecturas es (instancias calientes x 2) por
 * usuario y minuto, y la expulsion tarda hasta 30 s en las instancias que NO
 * atendieron el cambio. Sigue estando por debajo del minuto exigido.
 *
 * Node-only (cliente service-role): lo importa src/auth.ts, que ya lo es. Este
 * modulo NO puede acabar en el bundle del middleware — ver la nota del agujero
 * del edge en src/configs/auth.config.ts.
 */

interface CacheEntry {
    /** Valor crudo de la columna: ISO-8601 o null. */
    value: string | null
    fetchedAt: number
}

const cache = new Map<string, CacheEntry>()

/**
 * Techo de entradas. Un mapa a nivel de modulo en un proceso de vida larga es
 * una fuga de memoria en cuanto la app tenga muchos usuarios: sin tope crece con
 * cada id distinto que pase por aqui y no se vacia nunca. Al pasarse se tira la
 * entrada mas antigua (los `Map` de JS conservan el orden de insercion), que es
 * la que mas cerca esta de caducar de todas formas.
 */
const MAX_CACHE_ENTRIES = 5_000

/** Fila minima de `users`; la tabla no esta en los tipos generados. */
interface PasswordChangedAtRow {
    password_changed_at: string | null
}

function remember(userId: string, value: string | null): void {
    if (cache.size >= MAX_CACHE_ENTRIES && !cache.has(userId)) {
        const oldest = cache.keys().next()
        if (!oldest.done) cache.delete(oldest.value)
    }
    cache.set(userId, { value, fetchedAt: Date.now() })
}

/**
 * Siembra la cache con la marca RECIEN escrita.
 *
 * La llaman los dos caminos de cambio de contrasena justo despues de guardar.
 * POR QUE SEMBRAR Y NO SOLO INVALIDAR: sembrar deja la expulsion efectiva de
 * inmediato en esta instancia y ademas se ahorra la relectura. Invalidar sin mas
 * obligaria a volver a la base para enterarse de algo que este mismo proceso
 * acaba de escribir.
 *
 * No es `async` a proposito y este fichero no es `'use server'`: es una
 * escritura en memoria, no una accion.
 */
export function rememberPasswordChangedAt(
    userId: string,
    isoTimestamp: string,
): void {
    remember(userId, isoTimestamp)
}

/**
 * Devuelve la marca del usuario (ISO-8601) o `null` si nunca cambio la
 * contrasena o si la fila ya no existe.
 *
 * LANZA si la consulta falla. Es deliberado y es el mismo criterio que
 * `readUserProfile`: "no hay marca" y "no se pudo preguntar" son cosas opuestas.
 * Si un fallo de red se devolviera como `null`, el llamador lo leeria como
 * "todo en orden" — que aqui, por suerte, coincide con no expulsar a nadie; pero
 * el dia que alguien invierta el criterio por defecto, ese `null` mentiroso
 * expulsaria a todo el mundo durante una caida de Postgres. Quien llama decide
 * que hacer con la excepcion, y en src/auth.ts la decision escrita es dejar
 * viva la sesion.
 *
 * Una fila inexistente SI se cachea como `null`: es una respuesta valida de la
 * base, no un fallo.
 */
export async function getPasswordChangedAt(
    userId: string,
): Promise<string | null> {
    const hit = cache.get(userId)
    if (hit && Date.now() - hit.fetchedAt < REVOCATION_CACHE_TTL_MS) {
        return hit.value
    }

    const supabase = createServerSupabaseClient() as unknown as SupabaseClient

    const { data, error } = await supabase
        .from('users')
        .select('password_changed_at')
        .eq('id', userId)
        .maybeSingle()

    if (error) {
        // Sin `remember()`: una consulta fallida no envenena la cache con un
        // valor inventado durante 30 segundos.
        throw new Error(`No se pudo leer password_changed_at: ${error.message}`)
    }

    const value =
        (data as PasswordChangedAtRow | null)?.password_changed_at ?? null
    remember(userId, value)
    return value
}
