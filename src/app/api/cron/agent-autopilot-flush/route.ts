/**
 * GET /api/cron/agent-autopilot-flush
 *
 * Envía los mensajes de autopilot cuyo retardo humano ya venció. Es el
 * MISMO flush que corre al final de `agent-inbox-poll`, sacado a su propio
 * cron porque aquél pasa cada 5 minutos: para Fanvue vale, pero un fan de
 * Telegram que espera cinco minutos más el retardo cree que el bot está
 * roto. Idempotente: `flushDueAutopilotMessages` sólo toca filas
 * `approved` con `send_after` vencido, y `sendAgentMessage` sólo actúa
 * sobre `approved` — dos crones pisándose no envían dos veces.
 *
 * Gated by CRON_SECRET (Bearer), same as the other crons.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { flushDueAutopilotMessages } from '@/lib/agent/autopilot'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
    const secret = process.env.CRON_SECRET
    const authHeader = request.headers.get('authorization')
    if (secret && authHeader !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    const flushed = await flushDueAutopilotMessages()
    return NextResponse.json({ autoSent: flushed.sent, autoFailed: flushed.failed })
}
