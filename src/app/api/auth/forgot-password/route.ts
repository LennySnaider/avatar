import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase'
import { generateResetToken } from '@/lib/auth/resetToken'
import { clientIp, consumeRateLimit } from '@/lib/auth/rateLimit'
import { isEmailConfigured, sendEmail } from '@/lib/email/send'

/**
 * Solicitud de recuperación de contraseña.
 *
 * Esta ruta venía de la plantilla ECME con el cuerpo `return
 * NextResponse.json(true)`: un 200 que hacía a la UI cantar "hemos enviado un
 * correo" sin enviar nada. Después se dejó en 503 honesto. Esto ya es la
 * implementación, con el envío detrás de una costura
 * (`src/lib/email/send.ts`) porque elegir proveedor de correo es una decisión
 * del dueño del proyecto.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA REGLA QUE MANDA AQUÍ: LA RESPUESTA ES SIEMPRE LA MISMA
 * ─────────────────────────────────────────────────────────────────────────
 * Exista o no la cuenta, sea de credenciales o de OAuth, salga bien o mal el
 * envío: mismo cuerpo, mismo código y —hasta donde se puede— mismo tiempo.
 *
 * Si difiriera, este formulario público sería un ORÁCULO DE REGISTRO: cualquiera
 * pega una lista de correos filtrada de otra brecha y averigua cuáles tienen
 * cuenta aquí. Eso no es un dato menor en un producto de avatares/contenido
 * adulto — "esta persona tiene cuenta en este sitio" ES la información
 * sensible, más incluso que la contraseña. Y una vez sabes quién existe, ya
 * tienes la lista a la que dirigir el phishing y el relleno de credenciales.
 *
 * El tiempo cuenta igual que el cuerpo: si la rama "existe" hace una consulta,
 * un insert y una llamada al proveedor de correo, y la rama "no existe" vuelve
 * en 20 ms, la diferencia se mide desde fuera con un cronómetro. Por eso hay
 * un SUELO de tiempo (ver MIN_RESPONSE_MS).
 */

/** Formato de correo — el mismo criterio laxo que usa la ruta de sign-up. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * ÚNICA respuesta del camino normal. Redactada para ser verdad en los dos
 * casos: no promete que se haya enviado nada a nadie en concreto.
 */
const RESPUESTA_GENERICA =
    'If an account exists for that email address, we have sent it a link to reset the password. The link expires in 30 minutes.'

/**
 * SUELO DE TIEMPO. Toda respuesta del camino normal tarda al menos esto,
 * rellenando con espera lo que el trabajo real no haya consumido.
 *
 * LÍMITE HONESTO: es un suelo, no un tiempo constante. Si el proveedor de
 * correo tarda más que el suelo, la rama "la cuenta existe" se pasa y vuelve a
 * ser distinguible. La solución de verdad es sacar el envío del camino HTTP
 * (encolarlo y responder de inmediato), que exige infraestructura de colas que
 * el proyecto todavía no tiene. Queda anotado como deuda: mientras el envío
 * viva dentro del request, el suelo tapa el caso normal, no el patológico.
 */
const MIN_RESPONSE_MS = 1200

/**
 * LÍMITES DE ABUSO. Sin ellos esto es una máquina de mandar correo gratis:
 * apuntada a una dirección ajena la inunda (acoso), y repartida entre miles
 * quema la reputación del dominio remitente — con lo que los resets legítimos
 * acaban en spam — y cuesta dinero por envío.
 *
 *  - Por CORREO: 3 por hora. Alguien que de verdad no recibe el enlace lo pide
 *    dos o tres veces; a partir de ahí el problema no se arregla insistiendo.
 *  - Por IP: 10 por hora, más ancho porque detrás de una IP puede haber una
 *    oficina o un operador móvil entero (NAT). Ataja el barrido de listas, que
 *    es lo que se hace desde una sola IP a mucha velocidad.
 */
const LIMITE_POR_EMAIL = 3
const LIMITE_POR_IP = 10
const VENTANA_SEGUNDOS = 60 * 60

/** Fila mínima de `users` que necesita este flujo. */
interface UserLookupRow {
    id: string
    email: string
    name: string | null
    password_hash: string | null
}

const dormir = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Rellena hasta el suelo de tiempo. Ver MIN_RESPONSE_MS. */
async function esperarSuelo(inicio: number) {
    const restante = MIN_RESPONSE_MS - (Date.now() - inicio)
    if (restante > 0) await dormir(restante)
}

/**
 * URL pública de la app. Se reutiliza EL MISMO mecanismo que ya usan
 * `src/lib/fanvue/oauth.ts` y `src/services/SocialService.ts` para armar sus
 * callbacks (`NEXT_PUBLIC_APP_URL` con el puerto de desarrollo como respaldo).
 * Inventar aquí una variable propia dejaría dos fuentes de verdad para "dónde
 * vive esta app", y la que se olvidara de actualizar mandaría a los usuarios a
 * un dominio muerto — con un token de recuperación en la query string.
 */
function appUrl(): string {
    return (
        process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '') ||
        'http://localhost:3030'
    )
}

export async function POST(req: Request) {
    const inicio = Date.now()

    // ── Paso 0: ¿hay con qué enviar? ────────────────────────────────────────
    // Se comprueba ANTES de tocar la base y antes de mirar ningún correo. Sin
    // proveedor no hay recuperación posible, y emitir un token que nadie va a
    // recibir sólo deja secretos vivos en la tabla.
    //
    // Este 503 NO es un oráculo: no depende de la cuenta consultada, le sale
    // idéntico a todo el mundo. Es un fallo de instalación y se dice como tal
    // en vez de fingir que el correo salió.
    if (!isEmailConfigured()) {
        return NextResponse.json(
            {
                message:
                    'Password recovery by email is not available yet: this installation has no email provider configured. Please sign in and change your password from Settings > Security, or contact an administrator.',
            },
            { status: 503 },
        )
    }

    const body = (await req.json().catch(() => null)) as {
        email?: string
    } | null
    const email = body?.email?.trim().toLowerCase() ?? ''

    const ip = clientIp(req)

    // ── Paso 1: freno de abuso ──────────────────────────────────────────────
    // Antes de la consulta a la base: el trabajo que no se hace no se puede
    // usar para amplificar nada.
    //
    // El 429 tampoco es un oráculo: depende SÓLO del volumen de peticiones de
    // quien pregunta, no de si la cuenta existe. Un atacante puede provocarlo
    // a voluntad contra sí mismo y no aprende nada de nadie.
    const frenoIp = await consumeRateLimit({
        action: 'forgot-password',
        kind: 'ip',
        subject: ip,
        limit: LIMITE_POR_IP,
        windowSeconds: VENTANA_SEGUNDOS,
    })
    const frenoEmail = email
        ? await consumeRateLimit({
              action: 'forgot-password',
              kind: 'email',
              subject: email,
              limit: LIMITE_POR_EMAIL,
              windowSeconds: VENTANA_SEGUNDOS,
          })
        : { allowed: true, attempts: 0, retryAfterSeconds: 0 }

    if (!frenoIp.allowed || !frenoEmail.allowed) {
        const retry = Math.max(
            frenoIp.retryAfterSeconds,
            frenoEmail.retryAfterSeconds,
            1,
        )
        return NextResponse.json(
            {
                message:
                    'Too many password reset requests. Please wait a while before trying again.',
            },
            { status: 429, headers: { 'Retry-After': String(retry) } },
        )
    }

    // ── Paso 2: el trabajo, cuyo resultado NO cambia la respuesta ───────────
    // Todo lo de aquí abajo va dentro de un try enorme a propósito: cualquier
    // excepción que se escapara produciría un 500, y un 500 sólo puede darse
    // en las ramas que hacen trabajo de verdad — es decir, cuando la cuenta
    // EXISTE. Sería el oráculo colándose por la puerta de atrás.
    try {
        if (email && EMAIL_RE.test(email)) {
            await emitirYEnviar({ email, ip, req })
        }
    } catch (e) {
        // Se registra fuerte (esto es lo que hay que vigilar en producción) y
        // la persona recibe la misma respuesta que todos. La alarma es trabajo
        // del monitoreo, no del cuerpo de la respuesta.
        console.error(
            '[forgot-password] fallo procesando la solicitud:',
            e instanceof Error ? e.message : String(e),
        )
    }

    await esperarSuelo(inicio)

    return NextResponse.json({ message: RESPUESTA_GENERICA }, { status: 200 })
}

/**
 * Busca la cuenta y, si procede, emite el token y manda el correo.
 *
 * No devuelve nada y no distingue casos hacia fuera: quien llama no debe poder
 * enterarse de qué rama se tomó (ver la regla de la cabecera).
 */
async function emitirYEnviar({
    email,
    ip,
    req,
}: {
    email: string
    ip: string
    req: Request
}): Promise<void> {
    const supabase = createServerSupabaseClient() as unknown as SupabaseClient

    // `ilike` con los comodines escapados, igual que hace la ruta de sign-up:
    // sin escapar, un correo con `%` buscaría por patrón en vez de por valor.
    const emailPattern = email.replace(/[%_\\]/g, '\\$&')
    const { data, error } = await supabase
        .from('users')
        .select('id, email, name, password_hash')
        .ilike('email', emailPattern)
        .maybeSingle()

    if (error) {
        // Se propaga al try del POST: allí se registra y la respuesta sigue
        // siendo la genérica.
        throw new Error(`lookup de users falló: ${error.message}`)
    }

    const user = data as UserLookupRow | null

    if (!user) {
        // No existe. No se envía nada y no se dice nada.
        return
    }

    if (!user.password_hash) {
        // Cuenta de OAuth (GitHub/Google): no tiene contraseña que recuperar.
        // Ponerle una desde aquí crearía una SEGUNDA vía de acceso que su
        // dueño nunca pidió — y que cualquiera podría estrenar con sólo
        // conocer su correo. Silencio, misma respuesta genérica.
        //
        // Nota de producto: sería más amable mandarle un correo diciendo "tu
        // cuenta entra con Google", pero eso vuelve a ser un oráculo (sólo lo
        // recibe quien existe) y además revela con qué proveedor. Se deja
        // fuera a conciencia.
        return
    }

    const { token, tokenHash, expiresAt } = generateResetToken()

    // Se invalidan los tokens pendientes del usuario ANTES de emitir el nuevo.
    // POR QUÉ: pedir el reset tres veces dejaría tres enlaces vivos a la vez, y
    // cada uno es una llave completa a la cuenta durante 30 minutos. Vale la
    // pena el efecto secundario —si alguien pide dos y abre el correo viejo, le
    // dirá que el enlace ya no sirve— porque el mensaje de error es recuperable
    // (pide otro) y las llaves de más no.
    const { error: invalidateError } = await supabase
        .from('password_reset_tokens')
        .update({ used_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .is('used_at', null)

    if (invalidateError) {
        throw new Error(
            `no se pudieron invalidar los tokens previos: ${invalidateError.message}`,
        )
    }

    const { error: insertError } = await supabase
        .from('password_reset_tokens')
        .insert({
            user_id: user.id,
            token_hash: tokenHash,
            expires_at: expiresAt.toISOString(),
            requested_ip: ip,
            requested_user_agent:
                req.headers.get('user-agent')?.slice(0, 500) ?? null,
        })

    if (insertError) {
        throw new Error(`no se pudo guardar el token: ${insertError.message}`)
    }

    // El token EN CLARO sale de aquí una sola vez: hacia el correo. No se
    // registra, no se devuelve y no se guarda (en la tabla vive su hash).
    const link = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`
    const nombre = user.name?.trim() || 'there'

    await sendEmail({
        to: user.email,
        subject: 'Reset your password',
        text: [
            `Hi ${nombre},`,
            '',
            'We received a request to reset the password for your account.',
            'Open the link below to choose a new one. It expires in 30 minutes and can only be used once.',
            '',
            link,
            '',
            "If you didn't ask for this, you can ignore this email — your password stays as it is.",
        ].join('\n'),
        html: [
            `<p>Hi ${escapeHtml(nombre)},</p>`,
            '<p>We received a request to reset the password for your account.</p>',
            `<p><a href="${escapeHtml(link)}">Choose a new password</a></p>`,
            '<p>This link expires in 30 minutes and can only be used once.</p>',
            "<p>If you didn't ask for this, you can ignore this email — your password stays as it is.</p>",
        ].join('\n'),
    })
}

/**
 * Escape mínimo para meter texto en el HTML del correo.
 *
 * `name` lo escribe el propio usuario al registrarse, así que es entrada no
 * confiable: sin escapar, un nombre con `<img onerror=...>` viaja dentro de un
 * correo que enviamos NOSOTROS y con nuestra reputación de dominio detrás.
 */
function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}
