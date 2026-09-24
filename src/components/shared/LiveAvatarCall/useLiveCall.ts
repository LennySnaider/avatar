'use client'

/**
 * El cerebro de la llamada en vivo en el NAVEGADOR. Sirve igual para la
 * prueba interna (pestaña Live) y para el link público: la única diferencia
 * es `bootstrap`, que abre la sesión.
 *
 *   micrófono → worklet (bloques de 20 ms) → detector de voz → WAV de la frase
 *   → POST /api/live/turn → marcos NDJSON → audio al proveedor de cara
 *
 * Barge-in: si el visitante habla mientras el avatar habla (o piensa), se
 * aborta la petición en curso y se vacía el audio de la cara al instante.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { parseFrames, type LiveFrame } from '@/lib/live/frames'
import { FACE_AUDIO_SAMPLE_RATE, type FaceClientConfig } from '@/lib/live/face/types'
import { createFaceClient, type FaceClient } from './faceClients'
import { concatInt16, downsampleBuffer, encodeWav, floatTo16BitPCM, rms } from './wav'
import { VoiceActivityDetector } from './vad'

export interface LiveBootstrap {
    sessionId: string
    sessionSecret: string
    face: FaceClientConfig
    avatarName: string
    maxSessionSeconds: number
    heartbeatIntervalMs: number
}

export type LiveCallStatus =
    | 'idle'
    | 'connecting'
    | 'listening'
    | 'user_speaking'
    | 'thinking'
    | 'speaking'
    | 'ended'
    | 'error'

export interface UseLiveCallOptions {
    /** Abre la sesión (server action interna o ruta pública). Lanza con un mensaje presentable. */
    bootstrap: () => Promise<LiveBootstrap>
    apiBase?: string
}

const TARGET_RATE = 16000
const PRE_ROLL_BLOCKS = 15 // ~300 ms de audio antes de que el detector confirme voz
const MIN_UTTERANCE_SAMPLES = TARGET_RATE * 0.35
const MAX_UTTERANCE_SAMPLES = TARGET_RATE * 30
const BARGE_IN_SENSITIVITY = 1.6

function base64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
}

export function useLiveCall({ bootstrap, apiBase = '/api/live' }: UseLiveCallOptions) {
    const videoRef = useRef<HTMLVideoElement | null>(null)
    const audioRef = useRef<HTMLAudioElement | null>(null)

    const [status, setStatus] = useState<LiveCallStatus>('idle')
    const [error, setError] = useState<string | null>(null)
    const [notice, setNotice] = useState<string | null>(null)
    const [userCaption, setUserCaption] = useState('')
    const [avatarCaption, setAvatarCaption] = useState('')
    const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null)
    const [muted, setMuted] = useState(false)

    const session = useRef<LiveBootstrap | null>(null)
    const face = useRef<FaceClient | null>(null)
    const ctx = useRef<AudioContext | null>(null)
    const stream = useRef<MediaStream | null>(null)
    const node = useRef<AudioWorkletNode | null>(null)
    const vad = useRef(new VoiceActivityDetector())
    const preRoll = useRef<Int16Array[]>([])
    const utterance = useRef<Int16Array[] | null>(null)
    const utteranceSamples = useRef(0)
    const seq = useRef(0)
    const turnAbort = useRef<AbortController | null>(null)
    const speakingUntil = useRef(0)
    const timers = useRef<number[]>([])
    const mutedRef = useRef(false)
    const alive = useRef(false)

    const authHeader = () => ({ Authorization: `Bearer ${session.current?.sessionSecret ?? ''}` })

    const teardown = useCallback(async () => {
        alive.current = false
        turnAbort.current?.abort()
        timers.current.forEach((t) => window.clearInterval(t))
        timers.current = []
        node.current?.port.close()
        node.current?.disconnect()
        node.current = null
        stream.current?.getTracks().forEach((t) => t.stop())
        stream.current = null
        await ctx.current?.close().catch(() => undefined)
        ctx.current = null
        await face.current?.stop().catch(() => undefined)
        face.current = null
    }, [])

    const hangUp = useCallback(
        async (reason = 'hangup', message?: string) => {
            const s = session.current
            if (!alive.current && !s) return
            await teardown()
            if (s) {
                session.current = null
                void fetch(`${apiBase}/end`, {
                    method: 'POST',
                    headers: { ...{ Authorization: `Bearer ${s.sessionSecret}` }, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId: s.sessionId, reason }),
                    keepalive: true,
                }).catch(() => undefined)
            }
            setStatus('ended')
            if (message) setNotice(message)
        },
        [apiBase, teardown],
    )

    const settleToListening = useCallback(() => {
        const wait = Math.max(0, speakingUntil.current - Date.now())
        window.setTimeout(() => {
            if (!alive.current) return
            if (Date.now() >= speakingUntil.current && !turnAbort.current) {
                setStatus((prev) => (prev === 'speaking' || prev === 'thinking' ? 'listening' : prev))
            }
        }, wait + 150)
    }, [])

    const handleFrame = useCallback((frame: LiveFrame) => {
        switch (frame.type) {
            case 'session':
                setAvatarCaption('')
                break
            case 'transcript':
                setUserCaption(frame.text)
                break
            case 'text':
                setAvatarCaption((prev) => prev + frame.delta)
                break
            case 'audio': {
                const bytes = base64ToBytes(frame.pcm16)
                face.current?.sendPcm(bytes)
                // PCM16 mono: 2 bytes por muestra, a la frecuencia del proveedor.
                const rate = session.current ? FACE_AUDIO_SAMPLE_RATE[session.current.face.provider] : TARGET_RATE
                speakingUntil.current = Math.max(Date.now(), speakingUntil.current) + bytes.length / ((rate * 2) / 1000)
                setStatus('speaking')
                break
            }
            case 'done':
                face.current?.endTurn()
                if (frame.empty) setStatus('listening')
                break
            case 'error':
                setNotice(frame.message)
                break
            default:
                break
        }
    }, [])

    const sendTurn = useCallback(
        async (kind: 'utterance' | 'greeting', wav?: Uint8Array) => {
            const s = session.current
            if (!s || !alive.current) return
            turnAbort.current?.abort()
            const abort = new AbortController()
            turnAbort.current = abort
            seq.current += 1
            const form = new FormData()
            form.append('sessionId', s.sessionId)
            form.append('seq', String(seq.current))
            form.append('kind', kind)
            if (wav) form.append('audio', new Blob([wav as BlobPart], { type: 'audio/wav' }), 'utterance.wav')
            setStatus('thinking')
            try {
                const res = await fetch(`${apiBase}/turn`, {
                    method: 'POST',
                    headers: authHeader(),
                    body: form,
                    signal: abort.signal,
                })
                if (!res.ok || !res.body) {
                    const body = (await res.json().catch(() => ({}))) as { error?: string }
                    if (res.status === 410 || res.status === 401) {
                        await hangUp('server_closed', body.error ?? 'La llamada terminó.')
                        return
                    }
                    setNotice(body.error ?? 'No pude contestar, ¿me lo repites?')
                    setStatus('listening')
                    return
                }
                const reader = res.body.getReader()
                const decoder = new TextDecoder()
                let rest = ''
                for (;;) {
                    const { value, done } = await reader.read()
                    if (done) break
                    const parsed = parseFrames(rest + decoder.decode(value, { stream: true }))
                    rest = parsed.rest
                    parsed.frames.forEach(handleFrame)
                }
            } catch (e) {
                if (!(e instanceof DOMException && e.name === 'AbortError')) {
                    setNotice('Se cortó la respuesta. Vuelve a intentarlo.')
                }
            } finally {
                if (turnAbort.current === abort) {
                    turnAbort.current = null
                    settleToListening()
                }
            }
        },
        [apiBase, handleFrame, hangUp, settleToListening],
    )

    const bargeIn = useCallback(() => {
        turnAbort.current?.abort()
        turnAbort.current = null
        face.current?.interrupt()
        speakingUntil.current = 0
    }, [])

    const onMicBlock = useCallback(
        (block: Float32Array) => {
            const c = ctx.current
            if (!c || !alive.current) return
            const frameMs = (block.length / c.sampleRate) * 1000
            const pcm = floatTo16BitPCM(downsampleBuffer(block, c.sampleRate, TARGET_RATE))
            preRoll.current.push(pcm)
            if (preRoll.current.length > PRE_ROLL_BLOCKS) preRoll.current.shift()
            if (utterance.current) {
                utterance.current.push(pcm)
                utteranceSamples.current += pcm.length
            }
            if (mutedRef.current) return

            const avatarBusy = Date.now() < speakingUntil.current || turnAbort.current !== null
            const event = vad.current.process(rms(block), frameMs, avatarBusy ? BARGE_IN_SENSITIVITY : 1)
            const forceEnd = utterance.current !== null && utteranceSamples.current >= MAX_UTTERANCE_SAMPLES

            if (event === 'speech_start') {
                if (avatarBusy) bargeIn()
                utterance.current = [...preRoll.current]
                utteranceSamples.current = utterance.current.reduce((n, c2) => n + c2.length, 0)
                setStatus('user_speaking')
            } else if ((event === 'speech_end' || forceEnd) && utterance.current) {
                if (forceEnd) vad.current.reset()
                const pcmAll = concatInt16(utterance.current)
                utterance.current = null
                utteranceSamples.current = 0
                if (pcmAll.length < MIN_UTTERANCE_SAMPLES) {
                    setStatus('listening')
                    return
                }
                void sendTurn('utterance', encodeWav(pcmAll, TARGET_RATE))
            }
        },
        [bargeIn, sendTurn],
    )

    const start = useCallback(async () => {
        if (alive.current) return
        setError(null)
        setNotice(null)
        setUserCaption('')
        setAvatarCaption('')
        setStatus('connecting')
        // El AudioContext se crea DENTRO del gesto del usuario (Safari).
        const audioCtx = new AudioContext()
        ctx.current = audioCtx
        alive.current = true
        try {
            const [boot, mic] = await Promise.all([
                bootstrap(),
                navigator.mediaDevices.getUserMedia({
                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
                }),
            ])
            stream.current = mic
            session.current = boot
            setRemainingSeconds(boot.maxSessionSeconds)
            if (!videoRef.current || !audioRef.current) throw new Error('Faltan los elementos de vídeo')

            const client = await createFaceClient(boot.face, { video: videoRef.current, audio: audioRef.current })
            face.current = client
            await client.start()

            await audioCtx.audioWorklet.addModule('/live/mic-worklet.js')
            const source = audioCtx.createMediaStreamSource(mic)
            const worklet = new AudioWorkletNode(audioCtx, 'live-mic')
            worklet.port.onmessage = (ev: MessageEvent<Float32Array>) => onMicBlock(ev.data)
            source.connect(worklet)
            node.current = worklet

            timers.current.push(
                window.setInterval(async () => {
                    const s = session.current
                    if (!s) return
                    const res = await fetch(`${apiBase}/heartbeat`, {
                        method: 'POST',
                        headers: { ...authHeader(), 'Content-Type': 'application/json' },
                        body: JSON.stringify({ sessionId: s.sessionId }),
                    }).catch(() => null)
                    if (!res) return
                    const body = (await res.json().catch(() => ({}))) as { remainingSeconds?: number; error?: string }
                    if (res.status === 410 || res.status === 401) {
                        await hangUp('server_closed', body.error ?? 'La llamada terminó.')
                    } else if (typeof body.remainingSeconds === 'number') {
                        setRemainingSeconds(body.remainingSeconds)
                    }
                }, boot.heartbeatIntervalMs),
                window.setInterval(() => setRemainingSeconds((r) => (r === null ? r : Math.max(0, r - 1))), 1000),
            )
            setStatus('listening')
            void sendTurn('greeting')
        } catch (e) {
            const message =
                e instanceof DOMException && e.name === 'NotAllowedError'
                    ? 'Necesito permiso para usar el micrófono.'
                    : e instanceof Error
                      ? e.message
                      : 'No se pudo iniciar la llamada.'
            await hangUp('start_failed')
            setError(message)
            setStatus('error')
        }
    }, [apiBase, bootstrap, hangUp, onMicBlock, sendTurn])

    const toggleMute = useCallback(() => {
        mutedRef.current = !mutedRef.current
        if (mutedRef.current) {
            utterance.current = null
            vad.current.reset()
        }
        setMuted(mutedRef.current)
    }, [])

    // Cerrar la pestaña cuelga: `sendBeacon` no puede poner cabeceras, así que
    // el secreto va en el cuerpo (la ruta /end lo acepta ahí).
    useEffect(() => {
        const onPageHide = () => {
            const s = session.current
            if (!s) return
            navigator.sendBeacon(
                `${apiBase}/end`,
                new Blob([JSON.stringify({ sessionId: s.sessionId, secret: s.sessionSecret, reason: 'pagehide' })], {
                    type: 'application/json',
                }),
            )
        }
        window.addEventListener('pagehide', onPageHide)
        return () => {
            window.removeEventListener('pagehide', onPageHide)
            onPageHide()
            void teardown()
        }
    }, [apiBase, teardown])

    return {
        videoRef,
        audioRef,
        status,
        error,
        notice,
        userCaption,
        avatarCaption,
        remainingSeconds,
        muted,
        start,
        hangUp,
        toggleMute,
    }
}
