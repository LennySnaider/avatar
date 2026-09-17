/**
 * GET /api/cron/agent-autopilot-flush
 *
 * Envía los mensajes de autopilot cuyo retardo humano ya venció. Nació
 * dentro de `agent-inbox-poll` y salió a su propio cron porque aquél pasa
 * cada 5 minutos: para Fanvue vale, pero un fan de Telegram que espera cinco
 * minutos más el retardo cree que el bot está roto.
 *
 * Es el ÚNICO dueño de la cola: `agent-inbox-poll` ya no la barre. Lo que
 * impide enviar dos veces NO es eso —un cron puede solaparse consigo mismo si
 * una corrida se alarga— sino el RECLAMO ATÓMICO de
 * `flushDueAutopilotMessages`, que se queda la fila con un `UPDATE ... WHERE
 * status='approved' AND send_after IS NOT NULL` antes de enviarla. Antes se
 * afirmaba aquí que bastaba con que `sendAgentMessage` sólo actuase sobre
 * `approved`: era falso, porque entre su lectura y su escritura de `sent`
 * cabía entero el otro barrido.
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
