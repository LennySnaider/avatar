import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase'
import { hashPassword } from '@/lib/auth/password'
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/passwordPolicy'
import { clientIp, consumeRateLimit } from '@/lib/auth/rateLimit'
import { hashInvitationToken, isInvitationLive } from '@/lib/org/invitations'

/**
 * Aceptar una invitación a una organización: GET para saber a quién invita y
 * a qué, POST para crear la cuenta y entrar en la organización.
 *
 * Es la gemela de reset-password: un secreto de 256 bits que llega por la
 * query es lo ÚNICO que autoriza. Vive en `src/app/api/auth/**` porque es la
 * única carpeta que (a) el middleware salta entera, (b) ESLint exime de los
 * candados de import y (c) el centinela de tablas tenant exime — aquí no hay
 * sesión ni contexto de organización: la organización SALE DEL TOKEN.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DECISIONES DE SEGURIDAD
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  - EL EMAIL SALE DE LA INVITACIÓN, nunca del cuerpo. Si esta ruta aceptara
 *    un `email` y lo usara para crear la cuenta, cualquiera con un enlace
 *    podría registrarse como quien quisiera dentro de la organización ajena.
 *    Lo hace la función SQL `accept_organization_invitation`, que además crea
 *    usuario y membresía y quema la invitación en UNA transacción, contando
 *    los asientos bajo `for update` (ver la migración organization_invitations).
 *
 *  - MENSAJE GENÉRICO para inexistente, caducada, revocada y ya usada:
 *    distinguirlas confirma a quien tantea que ese token existió.
 *
 *  - EL GET ES UN ORÁCULO ACOTADO A PROPÓSITO: devuelve el email invitado y el
 *    nombre de la organización a quien ya tiene el secreto — o sea, al
 *    destinatario, que necesita leer "crearás la cuenta de ana@x.com en
 *    Acme". No lo "arregles" quitando el email: la página lo pinta en un
 *    campo deshabilitado para que la persona sepa con qué cuenta entra.
 *
 *  - RATE LIMIT por IP en los dos verbos. Es fail-open por diseño
 *    (rateLimit.ts): freno de martilleo contra la base, NO protección del
 *    token, que ya es infalsificable por fuerza bruta.
 */

const ENLACE_INVALIDO =
    'Esta invitación no es válida o ha caducado. Pide un enlace nuevo a quien te invitó.'

const VENTANA_SEGUNDOS = 60 * 60

interface InvitationRow {
    id: string
    organization_id: string
    email: string
    role: string
    expires_at: string
    accepted_at: string | null
    revoked_at: string | null
}

function db(): SupabaseClient {
    return createServerSupabaseClient() as unknown as SupabaseClient
}

function frenado(retryAfterSeconds: number) {
    return NextResponse.json(
        {
            message:
                'Demasiados intentos. Espera un rato antes de volver a probar.',
        },
        {
            status: 429,
            headers: { 'Retry-After': String(Math.max(retryAfterSeconds, 1)) },
        },
    )
}

export async function GET(req: Request) {
    const freno = await consumeRateLimit({
        action: 'accept-invite-preview',
        kind: 'ip',
        subject: clientIp(req),
        limit: 60,
        windowSeconds: VENTANA_SEGUNDOS,
    })
    if (!freno.allowed) return frenado(freno.retryAfterSeconds)

    const token = new URL(req.url).searchParams.get('token')?.trim() ?? ''
    if (!token) {
        return NextResponse.json({ message: ENLACE_INVALIDO }, { status: 400 })
    }

    const supabase = db()
    const { data, error } = await supabase
        .from('organization_invitations')
        .select(
            'id, organization_id, email, role, expires_at, accepted_at, revoked_at',
        )
        .eq('token_hash', hashInvitationToken(token))
        .maybeSingle()
    if (error) {
        console.error(
            '[accept-invite] lookup de la invitación falló:',
            error.message,
        )
        return NextResponse.json(
            {
                message:
                    'No se pudo consultar la invitación. Vuelve a intentarlo.',
            },
            { status: 503 },
        )
    }

    const row = data as InvitationRow | null
    if (
        !row ||
        !isInvitationLive({
            expiresAt: row.expires_at,
            acceptedAt: row.accepted_at,
            revokedAt: row.revoked_at,
        })
    ) {
        return NextResponse.json({ message: ENLACE_INVALIDO }, { status: 400 })
    }

    const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', row.organization_id)
        .maybeSingle()

    return NextResponse.json({
        email: row.email,
        role: row.role,
        organizationName:
            (org as { name: string } | null)?.name ?? 'la organización',
        expiresAt: row.expires_at,
    })
}

interface AcceptResult {
    ok: boolean
    reason?: 'invalid' | 'email_taken' | 'no_seats'
    email?: string
    organization_id?: string
    role?: string
}

export async function POST(req: Request) {
    const freno = await consumeRateLimit({
        action: 'accept-invite',
        kind: 'ip',
        subject: clientIp(req),
        limit: 10,
        windowSeconds: VENTANA_SEGUNDOS,
    })
    if (!freno.allowed) return frenado(freno.retryAfterSeconds)

    const body = (await req.json().catch(() => null)) as {
        token?: string
        name?: string
        password?: string
        confirmPassword?: string
    } | null

    const token = body?.token?.trim() ?? ''
    const name = body?.name?.trim() ?? ''
    const password = body?.password ?? ''
    const confirmPassword = body?.confirmPassword ?? ''

    if (!token) {
        return NextResponse.json({ message: ENLACE_INVALIDO }, { status: 400 })
    }
    if (!password || !confirmPassword) {
        return NextResponse.json(
            { message: 'Escribe y confirma tu contraseña.' },
            { status: 400 },
        )
    }
    if (password !== confirmPassword) {
        return NextResponse.json(
            { message: 'Las contraseñas no coinciden.' },
            { status: 400 },
        )
    }
    // Mismo mínimo que el resto de la app, desde la MISMA constante: una
    // validación que sólo vive en el formulario no valida nada.
    if (password.length < MIN_PASSWORD_LENGTH) {
        return NextResponse.json(
            {
                message: `La contraseña tiene que tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
            },
            { status: 400 },
        )
    }

    const { data, error } = await db().rpc('accept_organization_invitation', {
        p_token_hash: hashInvitationToken(token),
        // El id lo genera la app, no la base: `users.id` es text (superset de
        // los ids de NextAuth), igual que hace sign-up.
        p_user_id: randomUUID(),
        p_name: name || null,
        // Aquí NUNCA llega la contraseña en claro a la base.
        p_password_hash: await hashPassword(password),
    })
    if (error) {
        console.error('[accept-invite] la RPC falló:', error.message)
        return NextResponse.json(
            {
                message:
                    'No se pudo completar la invitación. Vuelve a intentarlo.',
            },
            { status: 503 },
        )
    }

    const result = data as AcceptResult
    if (!result.ok) {
        switch (result.reason) {
            case 'email_taken':
                // Aquí SÍ se distingue: el usuario necesita saber qué hacer, y
                // no revela nada que el poseedor del token no supiera ya.
                return NextResponse.json(
                    {
                        message:
                            'Ese email ya tiene una cuenta en la plataforma. Entra con ella o pide que te inviten con otro email.',
                    },
                    { status: 409 },
                )
            case 'no_seats':
                // La invitación NO se ha quemado: el mismo enlace sirve cuando
                // amplíen el plan.
                return NextResponse.json(
                    {
                        message:
                            'La organización se ha quedado sin asientos. Avisa a quien te invitó para que amplíe su paquete; este mismo enlace seguirá sirviendo.',
                    },
                    { status: 409 },
                )
            default:
                return NextResponse.json(
                    { message: ENLACE_INVALIDO },
                    { status: 400 },
                )
        }
    }

    return NextResponse.json({
        email: result.email,
        message: 'Tu cuenta está creada y ya formas parte de la organización.',
    })
}
