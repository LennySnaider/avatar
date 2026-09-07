'use server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { auth } from '@/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/passwordPolicy'
import { rememberPasswordChangedAt } from '@/lib/auth/passwordChangedAt'

/**
 * Cambio de contraseña del usuario LOGUEADO.
 *
 * POR QUÉ existe: hasta ahora la app no tenía NINGUNA forma de cambiar una
 * contraseña. La pantalla de Settings > Security era una maqueta de la
 * plantilla ECME (un `sleep(1000)` + `console.log`) que decía haber guardado
 * sin llamar a nada, y los dos endpoints de recuperación devolvían `true` sin
 * implementación. Esto cierra el caso "estoy dentro y quiero cambiarla".
 *
 * DECISIONES DE SEGURIDAD (el porqué de cada una):
 *
 *  - El id SALE DE LA SESIÓN, nunca de un parámetro. Si esta acción aceptara
 *    un `userId` del cliente, cualquiera con sesión válida podría cambiar la
 *    contraseña de cualquier otro usuario: una server action es un endpoint
 *    HTTP público, sus argumentos los pone quien llama, no el formulario.
 *
 *  - Se verifica la contraseña ACTUAL antes de tocar nada. Sin eso, una
 *    sesión robada (cookie filtrada, equipo desatendido) se convierte en un
 *    secuestro permanente de la cuenta: el atacante se cambia la contraseña y
 *    el dueño queda fuera. Pedir la actual obliga a conocer el secreto, no
 *    sólo a poseer la sesión.
 *
 *  - `users` NO es una tabla tenant (no tiene `organization_id`), así que NO
 *    pasa por `orgTable`: se usa el cliente de servidor igual que hace
 *    `validateCredential`. El filtro que acota aquí es el `id` de la sesión,
 *    que es más estrecho que cualquier scope de organización.
 *
 *  - Nunca se devuelve ni se registra el hash ni ninguna de las dos
 *    contraseñas. Los `console.error` de abajo llevan sólo el mensaje del
 *    error de base.
 *
 *  - SE CIERRAN LAS SESIONES ABIERTAS. El update escribe también
 *    `users.password_changed_at`, y el callback `jwt` de src/auth.ts expulsa a
 *    todo token cuya sesión empezara antes de esa marca. Sin esto, el cambio
 *    quitaba la llave pero dejaba la puerta abierta: una sesión robada seguía
 *    dentro hasta que el JWT caducara solo, que es justo lo contrario de lo que
 *    cree haber hecho quien cambia la contraseña por sospecha.
 */

export interface ChangePasswordInput {
    currentPassword: string
    newPassword: string
}

/**
 * Resultado deliberadamente PLANO (sin hash, sin usuario, sin datos de la
 * fila): lo único que cruza al cliente es si se pudo y qué decirle a la
 * persona.
 */
export interface ChangePasswordResult {
    success: boolean
    message: string
}

/**
 * El mínimo de longitud (aplicado EN SERVIDOR: el zod del formulario sólo
 * exigía `min(1)`, y una validación que sólo vive en el cliente no valida
 * nada) se mudó a `@/lib/auth/passwordPolicy`.
 *
 * POR QUÉ SE MUDÓ: la recuperación por correo tiene que aplicar exactamente
 * el mismo umbral, y este fichero es `'use server'` — ahí todo export debe ser
 * async, así que un `export const` no era opción y el número habría acabado
 * copiado en dos sitios. Dos constantes que deben ser iguales y viven
 * separadas divergen: el día que una suba a 12, la otra sigue siendo la puerta
 * ancha.
 */

/** Fila mínima de `users` que necesita esta acción (la tabla no está en los tipos generados). */
interface UserPasswordRow {
    id: string
    password_hash: string | null
}

const changePassword = async (
    input: ChangePasswordInput,
): Promise<ChangePasswordResult> => {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) {
        return {
            success: false,
            message: 'Your session has expired. Please sign in again.',
        }
    }

    const currentPassword = input?.currentPassword ?? ''
    const newPassword = input?.newPassword ?? ''

    if (!currentPassword || !newPassword) {
        return {
            success: false,
            message: 'Please fill in your current and new password.',
        }
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
        return {
            success: false,
            message: `Your new password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
        }
    }

    if (newPassword === currentPassword) {
        return {
            success: false,
            message:
                'Your new password must be different from the current one.',
        }
    }

    const supabase = createServerSupabaseClient() as unknown as SupabaseClient

    const { data, error } = await supabase
        .from('users')
        .select('id, password_hash')
        .eq('id', userId)
        .maybeSingle()

    if (error) {
        // Mismo criterio que `validateCredential`: un fallo de la BASE no se
        // le cuelga al usuario. Si aquí se devolviera "contraseña incorrecta"
        // se le mandaría a dudar de su propia memoria por un problema de red
        // o de credenciales de servicio.
        console.error('changePassword lookup failed:', error.message)
        return {
            success: false,
            message: 'We could not reach the user database. Please try again.',
        }
    }

    const user = data as UserPasswordRow | null

    if (!user) {
        // La sesión apunta a una fila que ya no existe. No se dice "el usuario
        // no existe" con detalle: se corta la sesión conceptualmente y punto.
        console.error(`changePassword: no users row for session id ${userId}`)
        return {
            success: false,
            message: 'Your session is no longer valid. Please sign in again.',
        }
    }

    if (!user.password_hash) {
        // Cuenta creada por OAuth: no hay contraseña que cambiar, y ponerle
        // una aquí crearía una segunda vía de acceso sin que nadie lo pida.
        return {
            success: false,
            message:
                'This account signs in with an external provider, so it has no password to change.',
        }
    }

    if (!(await verifyPassword(currentPassword, user.password_hash))) {
        return {
            success: false,
            message: 'Your current password is not correct.',
        }
    }

    const newHash = await hashPassword(newPassword)

    /**
     * `password_changed_at` es la MARCA DE INVALIDACIÓN DE SESIONES: el callback
     * `jwt` de src/auth.ts expulsa a todo token cuya sesión empezara antes de
     * este instante (ver src/lib/auth/sessionRevocation.ts).
     *
     * POR QUÉ VA EN EL MISMO UPDATE que el hash y no en una segunda escritura:
     * si fueran dos, un fallo entre medias dejaría la contraseña cambiada y las
     * sesiones abiertas — el estado exacto que este trabajo viene a eliminar, y
     * además silencioso. En un solo update, o cambian las dos cosas o no cambia
     * ninguna.
     */
    const cambiadaEn = new Date().toISOString()

    const { error: updateError } = await supabase
        .from('users')
        .update({
            password_hash: newHash,
            password_changed_at: cambiadaEn,
            updated_at: cambiadaEn,
        })
        // El `.eq` con el id de la SESIÓN es lo que impide que un update sin
        // filtro reescriba la tabla entera. No se toca ninguna otra fila.
        .eq('id', userId)

    if (updateError) {
        console.error('changePassword update failed:', updateError.message)
        return {
            success: false,
            message: 'We could not save your new password. Please try again.',
        }
    }

    // Siembra la caché de esta instancia con la marca recién escrita: la
    // expulsión se hace efectiva aquí de inmediato en vez de esperar a que
    // caduque la ventana de 30 s. En las demás instancias tarda esa ventana.
    rememberPasswordChangedAt(userId, cambiadaEn)

    return {
        success: true,
        /**
         * El mensaje dice que se cierran las sesiones porque a partir de ahora
         * ES VERDAD, y porque incluye la de quien está leyendo: su token es
         * anterior al cambio, así que la próxima petición lo devuelve al login.
         *
         * POR QUÉ NO SE SALVA LA SESIÓN ACTUAL: desde un JWT no hay forma de
         * distinguir "esta pestaña" del resto sin volver a firmar el token, y
         * cualquier atajo para re-sellarlo (por ejemplo desde el trigger
         * `update`) se lo podría disparar también el intruso desde su navegador
         * — sería regalarle la renovación justo a quien se quiere echar. Salir
         * de más es el lado correcto en el que equivocarse; callárselo, no.
         */
        message:
            'Your password has been updated. All sessions have been signed out, including this one — please sign in again.',
    }
}

export default changePassword
