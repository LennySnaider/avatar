import { NextResponse } from 'next/server'

/**
 * NO IMPLEMENTADO — y desde ahora lo DICE.
 *
 * Igual que su gemela de forgot-password, esta ruta era `return
 * NextResponse.json(true)` con un "implement reset password logic here"
 * dentro. El 200 hacía que la pantalla mostrara "Reset done / Your password
 * has been successfully reset" sin haber cambiado NADA: el usuario se iba
 * convencido de tener una contraseña nueva y en el siguiente login descubría
 * que la vieja seguía siendo la buena — o peor, se olvidaba de la vieja.
 *
 * 503 mientras no exista la implementación real. El camino que sí funciona es
 * Settings > Security (src/server/actions/user/changePassword.ts).
 *
 * QUÉ FALTA PARA IMPLEMENTARLO DE VERDAD (la lista larga de requisitos previos
 * está en src/app/api/auth/forgot-password/route.ts; sin aquel token emitido
 * esta ruta no tiene nada que validar):
 *
 *  1. Leer `token` + `password` del body.
 *  2. Hashear el token recibido y buscarlo en `password_reset_tokens`.
 *     Rechazar si no existe, si `expires_at` ya pasó o si `used_at` no es null
 *     (un token de un solo uso que se puede repetir es un token permanente).
 *  3. Aplicar el mismo mínimo de longitud que `changePassword`
 *     (MIN_PASSWORD_LENGTH), hashear con `hashPassword` de
 *     src/lib/auth/password.ts — NUNCA texto plano — y hacer el update de
 *     `users.password_hash` filtrando por el `user_id` del token.
 *  4. Marcar `used_at` en la misma operación y, idealmente, invalidar las
 *     sesiones abiertas de ese usuario: si el reset lo pidió el dueño porque
 *     sospecha que alguien entró, dejar viva la sesión del intruso vacía el
 *     motivo del reset.
 *  5. Respuestas de error genéricas ("invalid or expired link"), sin decir
 *     cuál de las dos cosas es ni a qué cuenta pertenece el token.
 */
export async function POST() {
    return NextResponse.json(
        {
            message:
                'Password reset by email is not available yet. Please sign in and change your password from Settings > Security, or contact an administrator.',
        },
        { status: 503 },
    )
}
