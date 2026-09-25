/**
 * Adaptadores de NAVEGADOR de los proveedores de cara (contrato de
 * `src/lib/live/face/types.ts`). Todos reciben el mismo audio —PCM16 LE,
 * 16 kHz, mono, el que sintetiza MiniMax— y devuelven la cara hablando por
 * WebRTC en el <video>. Los SDKs se cargan con `import()` dinámico al pulsar
 * "Llamar": no engordan el bundle de la página ni corren en el servidor.
 */
import type { FaceClientConfig } from '@/lib/live/face/types'

export interface FaceClient {
    /** Conecta y empieza a pintar la cara en el vídeo. */
    start(): Promise<void>
    /** Un trozo de audio de la respuesta. */
    sendPcm(chunk: Uint8Array): void
    /** Terminó el audio de este turno. */
    endTurn(): void
    /** Barge-in: callar YA y tirar lo que quede en cola. */
    interrupt(): void
    stop(): Promise<void>
}

export interface FaceElements {
    video: HTMLVideoElement
    audio: HTMLAudioElement
}

export async function createFaceClient(config: FaceClientConfig, els: FaceElements): Promise<FaceClient> {
    switch (config.provider) {
        case 'anam':
            return createAnam(config.sessionToken, els)
        case 'liveavatar':
            return createLiveAvatar(config.sessionToken, els)
        default: {
            const exhaustive: never = config
            throw new Error(`Proveedor de cara sin cliente: ${JSON.stringify(exhaustive)}`)
        }
    }
}

async function createAnam(sessionToken: string, els: FaceElements): Promise<FaceClient> {
    const { createClient } = await import('@anam-ai/js-sdk')
    // `disableInputAudio`: Anam NO escucha el micrófono; la escucha, el
    // cerebro y la voz son nuestros (modo passthrough).
    const client = createClient(sessionToken, { disableInputAudio: true })
    let input: ReturnType<typeof client.createAgentAudioInputStream> | null = null
    if (!els.video.id) els.video.id = `live-face-${Math.random().toString(36).slice(2)}`
    return {
        async start() {
            await client.streamToVideoElement(els.video.id)
            input = client.createAgentAudioInputStream({ encoding: 'pcm_s16le', sampleRate: 16000, channels: 1 })
        },
        sendPcm(chunk) {
            input?.sendAudioChunk(chunk)
        },
        endTurn() {
            input?.endSequence()
        },
        interrupt() {
            client.interruptPersona()
            input?.endSequence()
        },
        async stop() {
            await client.stopStreaming()
        },
    }
}

/** Medio segundo de PCM16 a 24 kHz: LiveAvatar recomienda trozos de ~1 s, pero
 *  esperar el segundo entero retrasaría la primera palabra. */
const LIVEAVATAR_FLUSH_BYTES = 24000

function bytesToBase64(bytes: Uint8Array): string {
    let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000) {
        bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    }
    return btoa(bin)
}

async function createLiveAvatar(sessionToken: string, els: FaceElements): Promise<FaceClient> {
    const { LiveAvatarSession, SessionEvent } = await import('@heygen/liveavatar-web-sdk')
    // Micrófono del SDK silenciado: la escucha es nuestra (detector de voz +
    // STT de MiniMax), LiveAvatar sólo pone la cara.
    const session = new LiveAvatarSession(sessionToken, { voiceChat: { defaultMuted: true }, autoKeepAlive: true })
    session.on(SessionEvent.SESSION_STREAM_READY, () => session.attach(els.video))

    // El SDK sólo expone `repeatAudio` (una frase entera con su cierre). Para
    // hablar mientras el TTS todavía genera, se usa el protocolo documentado
    // del modo LITE directamente sobre su WebSocket: `agent.speak` por trozo
    // y un `agent.speak_end` al terminar el turno, con el mismo event_id.
    const socket = () =>
        (session as unknown as { _sessionEventSocket?: WebSocket | null })._sessionEventSocket ?? null
    let turnId: string | null = null
    let pending: Uint8Array[] = []
    let pendingBytes = 0

    const flush = () => {
        if (!pendingBytes) return
        const merged = new Uint8Array(pendingBytes)
        let offset = 0
        for (const c of pending) {
            merged.set(c, offset)
            offset += c.length
        }
        pending = []
        pendingBytes = 0
        const ws = socket()
        if (ws && ws.readyState === WebSocket.OPEN) {
            turnId ??= crypto.randomUUID()
            ws.send(JSON.stringify({ type: 'agent.speak', event_id: turnId, audio: bytesToBase64(merged) }))
        } else {
            session.repeatAudio(bytesToBase64(merged))
        }
    }

    return {
        async start() {
            await session.start()
            session.attach(els.video)
        },
        sendPcm(chunk) {
            pending.push(chunk)
            pendingBytes += chunk.length
            if (pendingBytes >= LIVEAVATAR_FLUSH_BYTES) flush()
        },
        endTurn() {
            flush()
            const ws = socket()
            if (turnId && ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'agent.speak_end', event_id: turnId }))
            }
            turnId = null
        },
        interrupt() {
            pending = []
            pendingBytes = 0
            turnId = null
            session.interrupt()
        },
        async stop() {
            await session.stop()
        },
    }
}
