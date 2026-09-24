/**
 * POST /api/live/end — colgar. Acepta el secreto por `Authorization: Bearer`
 * o en el cuerpo (`{ sessionId, secret }`): al cerrar la pestaña el navegador
 * usa `navigator.sendBeacon`, que no puede poner cabeceras.
 *
 * Idempotente: colgar dos veces (botón + pagehide) no hace nada la segunda.
 */
import { after, NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { updateFanMemoryFromChat } from '@/lib/agent/draftPipeline'
import { authenticateLiveSession, bearerSecret, endLiveSession } from '@/lib/live/session'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
    const raw = await req.text().catch(() => '')
    let body: { sessionId?: string; secret?: string; reason?: string } = {}
    try {
        body = raw ? (JSON.parse(raw) as typeof body) : {}
    } catch {
        body = {}
    }
    const secret = bearerSecret(req.headers.get('authorization')) ?? bearerSecret(body.secret ? `Bearer ${body.secret}` : null)
    const session = await authenticateLiveSession(String(body.sessionId ?? ''), secret)
    if (!session) return NextResponse.json({ ok: false }, { status: 401 })

    const reason = typeof body.reason === 'string' && /^[a-z_]{1,40}$/.test(body.reason) ? body.reason : 'hangup'
    const { chatId, ended } = await endLiveSession(session, reason)
    if (ended && chatId && session.turns > 0) {
        after(() => updateFanMemoryFromChat(chatId))
    }
    return NextResponse.json({ ok: true })
}
