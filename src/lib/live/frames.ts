/**
 * Marcos NDJSON de un turno en vivo: el contrato entre `POST /api/live/turn`
 * (servidor) y `useLiveCall` (navegador). Una línea JSON por marco.
 *
 * PURO Y SIN IMPORTS a propósito: lo importan los dos lados. El audio viaja
 * en base64 (PCM16 little-endian, 16 kHz, mono — el formato que Simli
 * consume tal cual); el ~33 % de sobrecoste del base64 sobre 32 KB/s de PCM
 * es despreciable frente a la ventaja de poder depurarlo con `curl`.
 *
 * Por qué no el UI-message-stream del AI SDK: no tiene parte binaria y
 * `useChat` pelea con el ciclo de vida de una llamada (barge-in, orden de
 * audio, saludo sin mensaje de usuario).
 */

export interface LiveTurnUsage {
    /** Milisegundos que tardó el speech-to-text. */
    sttMs: number
    /** Milisegundos desde el inicio del LLM hasta su último token. */
    llmMs: number
    /** Caracteres facturables de TTS (lo que MiniMax reporta). */
    ttsChars: number
    /** Milisegundos de audio sintetizado. */
    audioMs: number
}

export type LiveFrame =
    | { type: 'session'; turnId: string; seq: number }
    | { type: 'transcript'; text: string; provider: string; durationMs: number }
    | { type: 'text'; delta: string }
    | { type: 'sentence'; index: number; text: string }
    | { type: 'audio'; index: number; pcm16: string }
    | { type: 'audio_end'; index: number }
    | {
          type: 'done'
          turnId: string
          replyText: string
          /** El visitante no dijo nada inteligible: no hubo respuesta. */
          empty?: boolean
          /** El visitante interrumpió: `replyText` es sólo lo que llegó a decirse. */
          interrupted?: boolean
          usage: LiveTurnUsage
      }
    | { type: 'error'; code: string; message: string }

export const LIVE_FRAME_CONTENT_TYPE = 'application/x-ndjson'

/** Un marco → una línea (con su salto). */
export function encodeFrame(frame: LiveFrame): string {
    return `${JSON.stringify(frame)}\n`
}

/**
 * Parsea las líneas COMPLETAS de un buffer de texto acumulado y devuelve lo
 * que sobra (una línea a medias) para la siguiente llamada. Una línea que no
 * es JSON válido se descarta: un marco roto no puede tumbar la llamada.
 */
export function parseFrames(buffer: string): { frames: LiveFrame[]; rest: string } {
    const frames: LiveFrame[] = []
    let start = 0
    for (;;) {
        const nl = buffer.indexOf('\n', start)
        if (nl === -1) break
        const line = buffer.slice(start, nl).trim()
        start = nl + 1
        if (!line) continue
        try {
            const parsed = JSON.parse(line) as unknown
            if (isFrame(parsed)) frames.push(parsed)
        } catch {
            // línea corrupta: se ignora
        }
    }
    return { frames, rest: buffer.slice(start) }
}

function isFrame(value: unknown): value is LiveFrame {
    return (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as { type?: unknown }).type === 'string'
    )
}
