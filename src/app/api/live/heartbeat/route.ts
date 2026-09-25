/**
 * POST /api/live/heartbeat — el navegador avisa cada 20 s de que la llamada
 * sigue abierta. Sin heartbeat en 2 min la sesión se da por muerta. Cuerpo
 * JSON `{ sessionId }`, `Authorization: Bearer <secreto>`.
 *
 * 410 = la sesión ya no se puede usar (tope de tiempo, módulo desinstalado,
 * modo apagado): el navegador cuelga.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
    authenticateLiveSession,
    bearerSecret,
    heartbeatLiveSession,
    LiveSessionError,
    requireUsableSession,
} from '@/lib/live/session'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
    const body = (await req.json().catch(() => null)) as { sessionId?: string } | null
    const session = await authenticateLiveSession(
        String(body?.sessionId ?? ''),
        bearerSecret(req.headers.get('authorization')),
    )
    if (!session) return NextResponse.json({ ok: false, code: 'unauthorized' }, { status: 401 })
    try {
        const usable = await requireUsableSession(session)
        const { remainingSeconds } = await heartbeatLiveSession(usable)
        return NextResponse.json({ ok: true, remainingSeconds })
    } catch (e) {
        if (e instanceof LiveSessionError) {
            return NextResponse.json({ ok: false, code: e.code, error: e.message }, { status: e.status })
        }
        throw e
    }
}
