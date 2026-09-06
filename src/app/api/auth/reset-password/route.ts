import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase'
import { hashPassword } from '@/lib/auth/password'
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/passwordPolicy'
import { hashResetToken, isResetTokenUsable } from '@/lib/auth/resetToken'
import { clientIp, consumeRateLimit } from '@/lib/auth/rateLimit'

/**
 * Consumo del enlace de recuperación: valida el token y fija la contraseña
 * nueva.
 *
 * Es la gemela de src/app/api/auth/forgot-password/route.ts, que es quien
 * emite el token. Las dos venían de la plantilla ECME devolviendo `true` sin
 * hacer nada — esta pantalla llegaba a decir "Your password has been
 * successfully reset" sin haber tocado la base, así que la persona se iba
 * convencida de tener una contraseña nueva.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DECISIONES DE SEGURIDAD
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  - El usuario SALE DEL TOKEN, nunca del cuerpo de la petición. Si esta ruta
 *    aceptara un `email` o un `userId` y lo usara para filtrar el update,
 *    cualquiera podría cambiarle la contraseña a quien quisiera. Lo único que
 *    autoriza aquí es poseer un secreto de 256 bits que salió por correo.
 *
 *  - MENSAJES DE ERROR GENÉRICOS. "Token inválido", "token caducado" y "token
 *    ya usado" son la misma frase hacia fuera. Distinguirlos le confirma a
 *    quien tantea que ese token existió —o sea, que hay una cuenta detrás— y
 *    convierte el endpoint en el mismo oráculo que forgot-password evita.
 *
 *  - EL TOKEN SE QUEMA ANTES DE TOCAR LA CONTRASEÑA, y el update de quemado
 *    lleva `used_at is null` en el filtro. Ese filtro es lo que hace el
 *    consumo atómico: dos peticiones simultáneas con el mismo token compiten
 *    por la misma fila y sólo una la ve sin usar. Al revés (cambiar la
 *    contraseña y luego marcar) un fallo entre los dos pasos dejaría un token
 *    de un solo uso reutilizable, que es un token permanente.
 */

/**
 * DEUDA CONOCIDA — ESTO NO CIERRA LAS SESIONES ABIERTAS.
 *
 * NextAuth v5 está configurado SIN adapter (ver src/auth.ts), así que la
 * sesión es un JWT firmado que vive en la cookie del navegador y NO se
 * consulta contra la base en cada petición. Consecuencia: cambiar
 * `users.password_hash` aquí no expulsa a nadie — quien ya tuviera una sesión
 * iniciada sigue dentro hasta que el token expire por su cuenta.
 *
 * POR QUÉ IMPORTA: el caso típico de un reset es "creo que alguien entró en mi
 * cuenta". Si el intruso conserva su sesión, el reset le quita la llave nueva
 * pero le deja la puerta abierta — que es justo lo contrario de lo que la
 * persona cree haber hecho.
 *
 * QUÉ HARÍA FALTA (cualquiera de los dos, no los dos):
 *
 *  a) Marca de invalidación: una columna `sessions_valid_from timestamptz` en
 *     `users`, puesta a `now()` en este mismo update y también en
 *     `changePassword`. El callback `jwt` de src/configs/auth.config.ts sella
 *     su instante de emisión en el token, y el callback `session` rechaza todo
 *     token emitido antes de esa marca. COSTE: una lectura de `users` por
 *     petición autenticada (o una caché con su propia ventana de retraso), que
 *     es precisamente lo que hoy se ahorra usando JWT.
 *
 *  b) Sesiones en base de datos: adapter de NextAuth con tabla `sessions` y
 *     `strategy: 'database'`, y borrar aquí las filas del usuario. Más
 *     directo, pero cambia el modelo de sesión de toda la app.
 *
 * No se implementa en este commit porque toca el flujo de autenticación
 * entero, no la recuperación de contraseña; queda escrito aquí, que es donde
 * lo va a leer quien venga a preguntarse si el reset expulsa al intruso. La
 * respuesta hoy es NO.
 */

/** Misma frase para no-existe, caducado y ya-usado. Ver la cabecera. */
const TOKEN_INVALIDO =
    'This password reset link is invalid or has expired. Please request a new one.'

/**
 * Freno de abuso por IP. Aquí no hay correo que limitar (el cuerpo sólo trae
 * un token), y el token en sí es infalsificable por fuerza bruta —2^256—, así
 * que el límite no defiende el secreto: defiende la BASE de un martilleo de
 * consultas gratis desde un endpoint sin sesión.
 */
const LIMITE_POR_IP = 20
const VENTANA_SEGUNDOS = 60 * 60

/** Fila mínima de `password_reset_tokens` que necesita la validación. */
interface ResetTokenRow {
    id: string
    user_id: string
    expires_at: string
    used_at: string | null
}

export async function POST(req: Request) {
    const body = (await req.json().catch(() => null)) as {
        token?: string
        newPassword?: string
        confirmPassword?: string
    } | null

    const token = body?.token?.trim() ?? ''
    const newPassword = body?.newPassword ?? ''
    const confirmPassword = body?.confirmPassword ?? ''

    const freno = await consumeRateLimit({
        action: 'reset-password',
        kind: 'ip',
        subject: clientIp(req),
        limit: LIMITE_POR_IP,
        windowSeconds: VENTANA_SEGUNDOS,
    })
    if (!freno.allowed) {
        return NextResponse.json(
            {
                message:
                    'Too many attempts. Please wait a while before trying again.',
            },
            {
                status: 429,
                headers: {
                    'Retry-After': String(Math.max(freno.retryAfterSeconds, 1)),
                },
            },
        )
    }

    if (!token) {
        // Llegar aquí sin token significa que se entró a /reset-password sin el
        // parámetro de la query. Mismo mensaje que un token malo: no hay nada
        // que ganar diferenciándolos y sí algo que perder.
        return NextResponse.json({ message: TOKEN_INVALIDO }, { status: 400 })
    }

    if (!newPassword || !confirmPassword) {
        return NextResponse.json(
            { message: 'Please enter and confirm your new password.' },
            { status: 400 },
        )
    }

    if (newPassword !== confirmPassword) {
        return NextResponse.json(
            { message: 'Your passwords do not match.' },
            { status: 400 },
        )
    }

    // Mismo mínimo que `changePassword`, desde la MISMA constante
    // (src/lib/auth/passwordPolicy.ts). El zod del formulario exige `min(1)` y
    // una validación que sólo vive en el cliente no valida nada: esta ruta es
    // alcanzable sin pasar por el formulario.
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
        return NextResponse.json(
            {
                message: `Your new password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
            },
            { status: 400 },
        )
    }

    const supabase = createServerSupabaseClient() as unknown as SupabaseClient

    // Se busca por el HASH: lo que viaja por la red y llega aquí es el token en
    // claro, y lo que hay guardado es su SHA-256 (ver la migración
    // 20260905120000_password_reset_tokens.sql y src/lib/auth/resetToken.ts).
    const { data, error } = await supabase
        .from('password_reset_tokens')
        .select('id, user_id, expires_at, used_at')
        .eq('token_hash', hashResetToken(token))
        .maybeSingle()

    if (error) {
        // Un fallo de la BASE no se le cuelga al usuario como "tu enlace es
        // inválido": se le mandaría a pedir otro enlace una y otra vez por un
        // problema que no es suyo. Mismo criterio que `changePassword`.
        console.error('[reset-password] lookup del token falló:', error.message)
        return NextResponse.json(
            {
                message:
                    'We could not reach the user database. Please try again.',
            },
            { status: 503 },
        )
    }

    const row = data as ResetTokenRow | null

    if (
        !row ||
        !isResetTokenUsable({ expiresAt: row.expires_at, usedAt: row.used_at })
    ) {
        return NextResponse.json({ message: TOKEN_INVALIDO }, { status: 400 })
    }

    // QUEMADO PRIMERO, con `used_at is null` en el filtro: ese predicado es el
    // que gana la carrera entre dos peticiones con el mismo token. `.select()`
    // devuelve las filas afectadas — si no vuelve ninguna, alguien se nos
    // adelantó y el token ya no vale.
    const { data: quemadas, error: burnError } = await supabase
        .from('password_reset_tokens')
        .update({ used_at: new Date().toISOString() })
        .eq('id', row.id)
        .is('used_at', null)
        .select('id')

    if (burnError) {
        console.error(
            '[reset-password] no se pudo quemar el token:',
            burnError.message,
        )
        return NextResponse.json(
            {
                message:
                    'We could not complete the password reset. Please try again.',
            },
            { status: 503 },
        )
    }

    if (!quemadas || (quemadas as { id: string }[]).length === 0) {
        return NextResponse.json({ message: TOKEN_INVALIDO }, { status: 400 })
    }

    const { error: updateError } = await supabase
        .from('users')
        .update({
            password_hash: await hashPassword(newPassword),
            updated_at: new Date().toISOString(),
        })
        // El `.eq` con el id que venía DENTRO del token es lo que impide que un
        // update sin filtro reescriba la tabla entera.
        .eq('id', row.user_id)

    if (updateError) {
        // El token ya está quemado y no se "des-quema": revertirlo abriría la
        // ventana de reutilización que el quemado-primero cierra. La persona
        // pide otro enlace; el precio de esta rama es un correo de más, no una
        // llave de más.
        console.error(
            '[reset-password] update de la contraseña falló:',
            updateError.message,
        )
        return NextResponse.json(
            {
                message:
                    'We could not save your new password. Please request a new reset link and try again.',
            },
            { status: 503 },
        )
    }

    return NextResponse.json(
        {
            message:
                'Your password has been updated. You can now sign in with it.',
        },
        { status: 200 },
    )
}
