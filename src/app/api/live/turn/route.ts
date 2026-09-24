/**
 * POST /api/live/turn — un turno de la conversación en vivo (módulo
 * live_avatar). Cuerpo multipart: `sessionId`, `seq`, `kind`
 * ('utterance' | 'greeting') y `audio` (WAV de la frase, sólo en utterance).
 * Autenticado por `Authorization: Bearer <secreto de la sesión>`, sin cookie
 * (el middleware exime /api/live/).
 *
 * Responde un stream NDJSON (`src/lib/live/frames.ts`). Si el navegador
 * corta la petición (barge-in), `req.signal` aborta LLM y TTS y el turno
 * guarda sólo lo que llegó a decirse.
 */
import { after, NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { updateFanMemoryFromChat } from '@/lib/agent/draftPipeline'
import { encodeFrame, LIVE_FRAME_CONTENT_TYPE, type LiveFrame } from '@/lib/live/frames'
import { LIVE_LIMITS } from '@/lib/live/policy'
import {
    authenticateLiveSession,
    bearerSecret,
    claimTurn,
    LiveSessionError,
    requireUsableSession,
} from '@/lib/live/session'
import { runLiveTurn } from '@/lib/live/turn'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const deny = (status: number, code: string, message: string) =>
    NextResponse.json({ ok: false, code, error: message }, { status })

export async function POST(req: NextRequest) {
    let form: FormData
    try {
        form = await req.formData()
    } catch {
        return deny(400, 'bad_request', 'Cuerpo inválido')
    }
    const sessionId = String(form.get('sessionId') ?? '')
    const seq = Number(form.get('seq'))
    const kind = form.get('kind') === 'greeting' ? 'greeting' : 'utterance'

    const session = await authenticateLiveSession(sessionId, bearerSecret(req.headers.get('authorization')))
    if (!session) return deny(401, 'unauthorized', 'Sesión no válida')

    let usable
    try {
        usable = await requireUsableSession(session)
    } catch (e) {
        if (e instanceof LiveSessionError) return deny(e.status, e.code, e.message)
        throw e
    }

    let audio: Uint8Array | null = null
    let mimeType = 'audio/wav'
    if (kind === 'utterance') {
        const file = form.get('audio')
        if (!(file instanceof Blob) || file.size === 0) return deny(400, 'no_audio', 'Falta el audio')
        if (file.size > LIVE_LIMITS.maxUtteranceBytes) return deny(413, 'too_large', 'Audio demasiado largo')
        audio = new Uint8Array(await file.arrayBuffer())
        mimeType = file.type || 'audio/wav'
    }

    if (!(await claimTurn(session, seq))) return deny(409, 'seq', 'Turno fuera de orden')

    const abort = new AbortController()
    req.signal.addEventListener('abort', () => abort.abort(), { once: true })
    const encoder = new TextEncoder()

    // La memoria del visitante se refresca cada N turnos, DESPUÉS de cerrar
    // el stream: no retrasa ni un milisegundo la respuesta.
    if (session.chat_id && seq % LIVE_LIMITS.memoryEveryTurns === 0) {
        const chatId = session.chat_id
        after(() => updateFanMemoryFromChat(chatId))
    }

    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            let closed = false
            const emit = (frame: LiveFrame) => {
                if (closed) return
                try {
                    controller.enqueue(encoder.encode(encodeFrame(frame)))
                } catch {
                    closed = true
                }
            }
            try {
                await runLiveTurn({ usable, seq, kind, audio, mimeType, signal: abort.signal, emit })
            } catch (e) {
                console.error('[live turn] fallo', { sessionId, seq }, e)
                emit({ type: 'error', code: 'turn_failed', message: 'No pude contestar, ¿me lo repites?' })
            } finally {
                if (!closed) {
                    closed = true
                    try {
                        controller.close()
                    } catch {
                        // ya cerrado por el cliente
                    }
                }
            }
        },
        cancel() {
            abort.abort()
        },
    })

    return new Response(stream, {
        headers: {
            'Content-Type': LIVE_FRAME_CONTENT_TYPE,
            'Cache-Control': 'no-store, no-transform',
            'X-Accel-Buffering': 'no',
        },
    })
}
