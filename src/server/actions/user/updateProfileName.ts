'use server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { auth } from '@/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { checkDisplayName } from '@/lib/auth/profileName'

/**
 * Cambio del NOMBRE del usuario logueado.
 *
 * ALCANCE DELIBERADO — sólo `name`:
 *
 *  - `email` NO se toca. Es la credencial de acceso: cambiarlo sin verificar la
 *    direccion nueva deja al usuario fuera de su propia cuenta a la primera
 *    errata. Verificar exige un proveedor de correo que hoy no existe (el
 *    reset por email está construido y esperando a Mailgun), asi que el campo
 *    se enseña en sólo lectura con esa explicacion en vez de fingir.
 *  - Telefono, direccion, ciudad, pais y codigo de pais NO existen como
 *    columnas de `users`. Un campo editable que no se persiste es la misma
 *    mentira que se acaba de limpiar del proyecto, sólo que mas discreta.
 *  - `image` SI existe en la tabla, pero subirla exige decidir donde viven las
 *    fotos de perfil, y el bucket `avatars` es de las referencias del producto,
 *    no de esto. Fuera de alcance a proposito.
 *
 * DECISIONES DE SEGURIDAD:
 *
 *  - El id SALE DE LA SESION, nunca de un parametro. Una server action es un
 *    endpoint HTTP publico: sus argumentos los pone quien llama, no el
 *    formulario. Si aceptara un `userId`, cualquiera con sesion valida
 *    renombraria a cualquier otro usuario.
 *  - El nombre se valida EN SERVIDOR (`checkDisplayName`) ademas de en el zod
 *    del formulario. Una validacion que sólo vive en el cliente no valida nada:
 *    esta accion es alcanzable sin pasar por la pantalla.
 *  - `users` NO es tabla tenant (no tiene `organization_id`), asi que NO pasa
 *    por `orgTable`: cliente de servidor y filtro por `id`, igual que
 *    `changePassword`. El `.eq('id', userId)` es lo que impide que un update
 *    sin filtro reescriba la tabla entera.
 *  - No se devuelve la fila. Sólo si se pudo, que decirle a la persona, y el
 *    nombre ya normalizado (que el cliente necesita para repintar el campo y
 *    refrescar la sesion sin volver a preguntar).
 */

export interface UpdateProfileNameInput {
    name: string
}

export interface UpdateProfileNameResult {
    success: boolean
    message: string
    /** El nombre tal cual quedó guardado (normalizado). Sólo si `success`. */
    name?: string
}

const updateProfileName = async (
    input: UpdateProfileNameInput,
): Promise<UpdateProfileNameResult> => {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) {
        return {
            success: false,
            message: 'Your session has expired. Please sign in again.',
        }
    }

    const checked = checkDisplayName(input?.name)
    if (!checked.ok) {
        return { success: false, message: checked.message }
    }

    const supabase = createServerSupabaseClient() as unknown as SupabaseClient

    const { data, error } = await supabase
        .from('users')
        .update({
            name: checked.value,
            updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
        // `select('id')` + `maybeSingle()` para poder distinguir "se guardó" de
        // "no habia fila que guardar". Sin esto un update que no toca ninguna
        // fila (sesion apuntando a un usuario borrado) devuelve exito y la
        // pantalla diria "guardado" sin que se haya guardado nada — otra vez el
        // mismo bug. Se pide `id`, no la fila entera.
        .select('id')
        .maybeSingle()

    if (error) {
        // Mismo criterio que `changePassword`: un fallo de la BASE no se le
        // cuelga al usuario ni se le enseña crudo.
        console.error('updateProfileName update failed:', error.message)
        return {
            success: false,
            message: 'We could not save your name. Please try again.',
        }
    }

    if (!data) {
        console.error(
            `updateProfileName: no users row for session id ${userId}`,
        )
        return {
            success: false,
            message: 'Your session is no longer valid. Please sign in again.',
        }
    }

    return {
        success: true,
        message: 'Your name has been updated.',
        name: checked.value,
    }
}

export default updateProfileName
