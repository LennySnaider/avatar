import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase'

/**
 * Lectura del perfil real de la fila `users`.
 *
 * POR QUE ES UN MODULO DE `lib/` Y NO UNA SERVER ACTION MAS: lo necesitan dos
 * llamadores muy distintos y ninguno puede importar al otro.
 *
 *  1. La server action que pinta el formulario de Settings > Profile.
 *  2. El callback `jwt` de `src/auth.ts` cuando llega `trigger === 'update'`.
 *     Ese callback NO puede importar una server action que a su vez importa
 *     `auth()` desde `src/auth.ts`: seria un ciclo. Y sobre todo, ahi no hay
 *     sesion que consultar — el unico dato disponible es `token.sub`.
 *
 * La consulta es la misma en los dos sitios, asi que vive una sola vez. Es
 * Node-only (cliente service-role); `src/auth.ts` ya lo es.
 *
 * `users` NO es tabla tenant (no tiene `organization_id`), asi que no pasa por
 * `orgTable`: el filtro que acota es el `id`, mas estrecho que cualquier scope
 * de organizacion. Mismo criterio que `validateCredential` y `changePassword`.
 */

/** Sólo lo que se usa. La tabla `users` no está en los tipos generados. */
export interface UserProfileRow {
    /** `name` es NULLABLE en la base: las cuentas creadas sin nombre existen. */
    name: string | null
    email: string
}

/**
 * Devuelve el perfil, `null` si no hay fila para ese id, y LANZA si la consulta
 * falla.
 *
 * POR QUE SE DISTINGUE "no hay fila" DE "no se pudo consultar": son dos cosas
 * opuestas y el llamador tiene que reaccionar distinto. `null` significa que la
 * sesion apunta a un usuario que ya no existe (hay que echarlo). Una excepcion
 * significa que la BASE no contesta — devolver `null` ahi le diria al usuario
 * que su cuenta no existe por un problema de red, que es exactamente el fallo
 * que ya se corrigió en `validateCredential`.
 */
export async function readUserProfile(
    userId: string,
): Promise<UserProfileRow | null> {
    const supabase = createServerSupabaseClient() as unknown as SupabaseClient

    const { data, error } = await supabase
        .from('users')
        .select('name, email')
        .eq('id', userId)
        .maybeSingle()

    if (error) {
        throw new Error(
            `No se pudo leer el perfil del usuario: ${error.message}`,
        )
    }

    return (data as UserProfileRow | null) ?? null
}
