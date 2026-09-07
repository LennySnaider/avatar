import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase'
import { hashPassword } from '@/lib/auth/password'
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/passwordPolicy'
import { hashResetToken, isResetTokenUsable } from '@/lib/auth/resetToken'
import { clientIp, consumeRateLimit } from '@/lib/auth/rateLimit'
import { rememberPasswordChangedAt } from '@/lib/auth/passwordChangedAt'

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
 * DEUDA CERRADA — ESTO YA CIERRA LAS SESIONES ABIERTAS.
 *
 * Aquí decía que no las cerraba. El problema era real: NextAuth v5 está
 * configurado SIN adapter (ver src/auth.ts), así que la sesión es un JWT
 * firmado que vive en la cookie y NO se consulta contra la base en cada
 * petición — cambiar `users.password_hash` no expulsaba a nadie. Y el caso
 * típico de un reset es justamente "creo que alguien entró en mi cuenta": el
 * intruso se quedaba dentro hasta que su token caducara solo, con la persona
 * convencida de haberlo echado.
 *
 * De las dos salidas que quedaron escritas se tomó la (a), la marca de
 * invalidación, porque la (b) —adapter con tabla `sessions` y
 * `strategy: 'database'`— cambia el modelo de sesión de toda la app:
 *
 *  - Columna `users.password_changed_at` (migración
 *    supabase/migrations/20260906190000_users_password_changed_at.sql), escrita
 *    en el mismo update que el hash, más abajo.
 *
 *  - El callback `jwt` de src/auth.ts —NO el de auth.config.ts, que se empaqueta
 *    en el middleware edge y no puede tocar la base— compara la marca contra el
 *    claim `sessionStartedAt` que el token sella en el login, y devuelve `null`
 *    (lo que destruye la sesión y borra la cookie) cuando la sesión es anterior.
 *
 *  - El coste que preocupaba —una lectura de `users` por petición autenticada—
 *    se acota con una caché de 30 s en memoria del proceso
 *    (src/lib/auth/passwordChangedAt.ts): la expulsión se hace efectiva en menos
 *    de medio minuto y no añade una lectura por request.
 *
 * LO QUE SIGUE SIN CUBRIR, dicho aquí para que no haya que descubrirlo: el
 * middleware (edge) no puede consultar la base, así que un token ya revocado
 * SIGUE pasando su comprobación de "hay sesión" hasta que algo en runtime Node
 * llame a `auth()`. El detalle y las salidas posibles están escritos en
 * src/configs/auth.config.ts.
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

    /**
     * `password_changed_at` es la MARCA DE INVALIDACIÓN DE SESIONES (ver la
     * cabecera). Va en el MISMO update que el hash: si fueran dos escrituras,
     * un fallo entre medias dejaría la contraseña cambiada y al intruso dentro
     * — el estado exacto que este endpoint viene a eliminar, y sin avisar.
     *
     * Este flujo es el que más lo necesita de los dos: quien llega aquí lo hace
     * porque perdió el acceso o porque sospecha que alguien más lo tiene.
     */
    const cambiadaEn = new Date().toISOString()

    const { error: updateError } = await supabase
        .from('users')
        .update({
            password_hash: await hashPassword(newPassword),
            password_changed_at: cambiadaEn,
            updated_at: cambiadaEn,
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

    // Siembra la caché de esta instancia con la marca recién escrita: aquí la
    // expulsión es inmediata en vez de esperar la ventana de 30 s. En las demás
    // instancias tarda esa ventana. No toca la base y no puede fallar.
    rememberPasswordChangedAt(row.user_id, cambiadaEn)

    return NextResponse.json(
        {
            message:
                'Your password has been updated and every open session has been signed out. You can now sign in with it.',
        },
        { status: 200 },
    )
}
