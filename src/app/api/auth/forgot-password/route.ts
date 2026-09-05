import { NextResponse } from 'next/server'

/**
 * NO IMPLEMENTADO — y desde ahora lo DICE.
 *
 * Esta ruta venía de la plantilla ECME con el cuerpo `return
 * NextResponse.json(true)` y el comentario "implement forgot password logic
 * here". El 200 hacía que la UI enseñara "Check your email / We have sent a
 * password recovery to your email": una mentira completa. Quien la creyera se
 * quedaba esperando un correo que nadie envía nunca, sin ningún indicio de que
 * el problema no era su bandeja de spam.
 *
 * Devolver 503 no arregla la recuperación, pero convierte un fallo SILENCIOSO
 * en uno visible. Mientras no exista la implementación real, el camino que sí
 * funciona es: entrar con la contraseña actual y cambiarla en
 * Settings > Security (src/server/actions/user/changePassword.ts).
 *
 * QUÉ FALTA PARA IMPLEMENTARLO DE VERDAD (esto no se implementa aquí porque
 * exige elegir y contratar un proveedor de correo, y esa decisión es del
 * dueño del proyecto, no de quien pasa por el fichero):
 *
 *  1. Proveedor de email transaccional (Resend, SES, Postmark…) con dominio
 *     verificado y SPF/DKIM, y su clave en las env de Vercel.
 *  2. Tabla de tokens de recuperación — p. ej. `password_reset_tokens`
 *     (user_id, token_hash, expires_at, used_at). Se guarda el HASH del token,
 *     no el token: la tabla es un objetivo tan jugoso como `users.password_hash`.
 *     Caducidad corta (15-30 min) y un solo uso (`used_at`).
 *  3. Este POST: buscar el email en `users`, y RESPONDER SIEMPRE LO MISMO
 *     exista o no (si no, el formulario se convierte en un oráculo que dice
 *     qué correos están registrados). Si existe y es cuenta de credenciales,
 *     generar el token, guardar su hash y enviar el enlace
 *     `/reset-password?token=…`.
 *  4. Límite de intentos por email y por IP: sin él, esto es un cañón de spam
 *     gratuito contra terceros a costa de la reputación del dominio.
 *  5. Cuentas OAuth (`users.password_hash` null): no tienen contraseña que
 *     recuperar — mismo mensaje genérico, pero sin enviar nada.
 *
 * El emparejado de esta ruta es src/app/api/auth/reset-password/route.ts, que
 * consumiría el token; los dos se implementan juntos o ninguno sirve.
 */
export async function POST() {
    return NextResponse.json(
        {
            message:
                'Password recovery by email is not available yet. Please sign in and change your password from Settings > Security, or contact an administrator.',
        },
        { status: 503 },
    )
}
