import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase'

/**
 * Freno de abuso contra la base de datos.
 *
 * POR QUÉ CONTRA LA BASE Y NO EN MEMORIA: el proyecto no tiene Redis ni
 * ninguna infraestructura de rate limit, y un `Map` en el proceso no limita
 * nada en Vercel — cada petición puede caer en una lambda distinta (o en una
 * recién arrancada), así que el contador nace a cero una y otra vez. La base
 * es el único estado compartido que ya existe.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LÍMITES CONOCIDOS DE ESTA IMPLEMENTACIÓN (para que nadie la crea más de lo
 * que es):
 *
 *  1. VENTANA FIJA, no deslizante. El cubo se reinicia entero al vencer, así
 *     que quien cronometre el reinicio puede colar hasta 2× el límite a
 *     caballo de dos ventanas. Aceptable: esto es un freno anti-ráfaga, no un
 *     contrato de caudal.
 *  2. Cuesta un viaje a Postgres por petición. En un endpoint de recuperación
 *     de contraseña (tráfico bajísimo) es irrelevante; NO se puede reutilizar
 *     tal cual en una ruta caliente.
 *  3. Si la base falla, `consumeRateLimit` deja pasar (fail-open) y lo dice
 *     en el log. Fail-closed convertiría una caída de Postgres en "nadie
 *     puede recuperar su contraseña"; y quien ya no tiene base tampoco tiene
 *     usuarios que consultar ni tokens que emitir, así que el flujo se corta
 *     igual un paso más abajo, pero con un error honesto.
 *  4. La IP sale de `x-forwarded-for`, que es una cabecera y por tanto
 *     falsificable si algo llega al servidor sin pasar por el proxy. Detrás
 *     de Vercel la primera entrada la pone la plataforma; en un despliegue
 *     propio hay que verificar quién escribe esa cabecera antes de confiar en
 *     el límite por IP. El límite por correo NO depende de esto.
 *  5. Un atacante con IPs rotativas (botnet, proxies) se salta el límite por
 *     IP; el de por-correo lo sigue frenando para la víctima concreta.
 */

export interface RateLimitResult {
    allowed: boolean
    /** Intentos contados dentro de la ventana actual (incluido el que se acaba de contar). */
    attempts: number
    /** Segundos hasta que la ventana se reinicia. 0 si ya se reinició. */
    retryAfterSeconds: number
}

/**
 * Construye la clave del cubo con el sujeto HASHEADO.
 *
 * El hash no es paranoia decorativa: en el cubo por-correo entran también las
 * direcciones que un atacante tantea, existan o no. Guardarlas en claro
 * convertiría `auth_rate_limits` en un listado de "quién ha pedido recuperar
 * su contraseña, y desde qué IP" — justo la información que el endpoint se
 * esfuerza en no filtrar por la respuesta. Hasheado sigue contando igual de
 * bien, que es todo lo que un rate limit necesita.
 */
function bucketKey(action: string, kind: string, subject: string): string {
    const digest = createHash('sha256')
        .update(subject.trim().toLowerCase(), 'utf8')
        .digest('hex')
    return `${action}:${kind}:${digest}`
}

/**
 * Cuenta un intento y dice si se permite.
 *
 * El incremento y la comparación los hace la función SQL
 * `consume_auth_rate_limit` en una sola sentencia atómica: hacerlo aquí con
 * select + update sería una carrera que N peticiones simultáneas ganan a la
 * vez — exactamente el caso que hay que parar.
 */
export async function consumeRateLimit(params: {
    action: string
    kind: string
    subject: string
    limit: number
    windowSeconds: number
}): Promise<RateLimitResult> {
    const { action, kind, subject, limit, windowSeconds } = params

    const permisivo: RateLimitResult = {
        allowed: true,
        attempts: 0,
        retryAfterSeconds: 0,
    }

    try {
        const supabase =
            createServerSupabaseClient() as unknown as SupabaseClient

        const { data, error } = await supabase.rpc('consume_auth_rate_limit', {
            p_bucket: bucketKey(action, kind, subject),
            p_limit: limit,
            p_window_seconds: windowSeconds,
        })

        if (error) {
            // Fail-open documentado (límite 3 de la cabecera). Se registra el
            // motivo para que una caída del freno sea visible en los logs y no
            // un silencio cómodo.
            console.error(
                `[rateLimit] ${action}:${kind} sin freno — la RPC falló: ${error.message}`,
            )
            return permisivo
        }

        const row = data as {
            allowed?: boolean
            attempts?: number
            retry_after_seconds?: number
        } | null

        return {
            allowed: row?.allowed !== false,
            attempts: Number(row?.attempts ?? 0),
            retryAfterSeconds: Number(row?.retry_after_seconds ?? 0),
        }
    } catch (e) {
        console.error(
            `[rateLimit] ${action}:${kind} sin freno — excepción: ${
                e instanceof Error ? e.message : String(e)
            }`,
        )
        return permisivo
    }
}

/**
 * IP del cliente tal como la ve la plataforma.
 *
 * Devuelve 'unknown' cuando no hay cabecera: es un valor legítimo de cubo (a
 * propósito). Si se devolviera `null` y se saltara el límite, bastaría con no
 * mandar la cabecera para quedar exento — el fallback tiene que ser un cubo
 * compartido, no una puerta abierta.
 */
export function clientIp(req: Request): string {
    const forwarded = req.headers.get('x-forwarded-for')
    if (forwarded) {
        // La primera entrada es el cliente original; el resto son los proxies.
        const first = forwarded.split(',')[0]?.trim()
        if (first) return first
    }
    return req.headers.get('x-real-ip')?.trim() || 'unknown'
}
