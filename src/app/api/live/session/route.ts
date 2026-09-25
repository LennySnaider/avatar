/**
 * POST /api/live/session — abre una llamada desde el LINK PÚBLICO (o el
 * widget) de un avatar. Cuerpo JSON: `{ token, visitorId, displayName?,
 * embedded?, embedderOrigin? }`. Sin sesión de NextAuth (visitante anónimo).
 *
 * Frenos, en orden: interruptor global `LIVE_PUBLIC_ENABLED`, token válido
 * con público encendido y módulo instalado, límite por IP, web que embebe
 * permitida, y los topes del avatar (simultáneas, minutos del día) dentro de
 * `startLiveSession`. Cualquier rechazo de configuración responde el MISMO
 * 404: no se delata si el token existe.
 */
import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { clientIp, consumeRateLimit } from '@/lib/auth/rateLimit'
import { isEmbedAllowed } from '@/lib/live/policy'
import { getPublicLiveProfile, LiveSessionError, startLiveSession } from '@/lib/live/session'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const NOT_FOUND = () => NextResponse.json({ ok: false, error: 'Este avatar no está disponible.' }, { status: 404 })

export async function POST(req: NextRequest) {
    const body = (await req.json().catch(() => null)) as {
        token?: string
        visitorId?: string
        displayName?: string
        embedded?: boolean
        embedderOrigin?: string | null
    } | null
    const token = String(body?.token ?? '')
    const visitorId = String(body?.visitorId ?? '')
    if (!/^[A-Za-z0-9-]{8,64}$/.test(visitorId)) {
        return NextResponse.json({ ok: false, error: 'Visitante no válido' }, { status: 400 })
    }

    const profile = await getPublicLiveProfile(token)
    if (!profile) return NOT_FOUND()

    const ip = clientIp(req)
    const freno = await consumeRateLimit({ action: 'live_session', kind: 'ip', subject: ip, limit: 10, windowSeconds: 600 })
    if (!freno.allowed) {
        return NextResponse.json(
            { ok: false, error: 'Demasiados intentos. Espera unos minutos.' },
            { status: 429, headers: { 'Retry-After': String(freno.retryAfterSeconds) } },
        )
    }
    if (!isEmbedAllowed(profile.allowedOrigins, body?.embedderOrigin ?? null, Boolean(body?.embedded))) {
        return NOT_FOUND()
    }

    try {
        const started = await startLiveSession({
            avatarId: profile.avatarId,
            expectedOrganizationId: profile.organizationId,
            source: 'public',
            visitorId: `v-${visitorId}`,
            displayName: body?.displayName?.slice(0, 60) ?? null,
            ipHash: createHash('sha256').update(ip).digest('hex'),
            userAgent: req.headers.get('user-agent'),
        })
        return NextResponse.json({ ok: true, ...started })
    } catch (e) {
        if (e instanceof LiveSessionError) {
            // Los rechazos de configuración (sin cara, sin voz…) son asunto del
            // dueño, no del visitante: se ven como "no disponible".
            if (e.status === 429) return NextResponse.json({ ok: false, error: e.message }, { status: 429 })
            if (e.status === 502) return NextResponse.json({ ok: false, error: 'No se pudo conectar. Inténtalo en un momento.' }, { status: 502 })
            return NOT_FOUND()
        }
        console.error('[live session] fallo al abrir la sesión pública', e)
        return NextResponse.json({ ok: false, error: 'Error inesperado' }, { status: 500 })
    }
}
