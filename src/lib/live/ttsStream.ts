/**
 * TTS por streaming de MiniMax para el modo en vivo: `POST /v1/t2a_v2` con
 * `stream: true` devuelve trozos SSE (`data: {...}`) con el audio en hex.
 * Se pide PCM mono a la frecuencia que exige el proveedor de cara, para empujarlo TAL CUAL
 * (Anam a 16 kHz, LiveAvatar a 24 kHz), sin resamplear nada.
 *
 * Vive aquí y no en `MiniMaxService.ts` porque ese fichero es `'use server'`
 * y un export que devuelve un generador asíncrono no puede ser una server
 * action. `textToSpeech` (mp3 completo, para Voice Studio y las notas de voz
 * de Fanvue) NO se toca.
 *
 * Modelo `speech-2.8-turbo` por defecto: en una conversación manda la
 * latencia del primer trozo; `LIVE_TTS_MODEL` permite subir a `-hd`.
 */
import type { MiniMaxTTSModel, MiniMaxEmotion } from '@/@types/minimax'
import type { VoiceTtsSettings } from '@/@types/voice'

const MINIMAX_T2A_URL = 'https://api.minimax.io/v1/t2a_v2'
export const LIVE_PCM_SAMPLE_RATE = 16000

export interface SynthesizeInput {
    text: string
    voiceId: string
    settings?: VoiceTtsSettings | null
    /** Idioma de la voz (`Spanish`, `English`…) para `language_boost` cuando no va en auto. */
    language?: string | null
    /** PCM a esta frecuencia (la que pide el proveedor de cara). Default 16 kHz. */
    sampleRate?: 16000 | 24000
    signal?: AbortSignal
}

export interface SynthesizeUsage {
    characters: number
    audioMs: number
}

interface StreamChunk {
    data?: { audio?: string; status?: number }
    extra_info?: { usage_characters?: number; audio_length?: number }
    base_resp?: { status_code?: number; status_msg?: string }
}

function model(): MiniMaxTTSModel {
    const m = process.env.LIVE_TTS_MODEL
    return m === 'speech-2.8-hd' || m === 'speech-2.6-turbo' || m === 'speech-2.6-hd' ? m : 'speech-2.8-turbo'
}

/**
 * Genera trozos PCM16 LE 16 kHz mono a medida que MiniMax los produce. El
 * valor de retorno del generador trae el uso (caracteres facturables y
 * milisegundos de audio) del último trozo (`status: 2`).
 */
export async function* synthesizePcmStream(input: SynthesizeInput): AsyncGenerator<Uint8Array, SynthesizeUsage> {
    const key = process.env.MINIMAX_API_KEY
    if (!key) throw new Error('MINIMAX_API_KEY is not defined')
    const s = input.settings ?? {}
    const res = await fetch(MINIMAX_T2A_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        signal: input.signal,
        body: JSON.stringify({
            model: model(),
            text: input.text,
            stream: true,
            output_format: 'hex',
            // 'auto' deja mandar el acento de la muestra clonada (mismo
            // criterio que voice/preview/route.ts).
            language_boost: s.useAutoAccent ? 'auto' : (input.language ?? null),
            voice_setting: {
                voice_id: input.voiceId,
                speed: s.speed ?? 1.0,
                vol: 1.0,
                pitch: s.pitch ?? 0,
                ...(s.emotion ? { emotion: s.emotion as MiniMaxEmotion } : {}),
            },
            audio_setting: { sample_rate: input.sampleRate ?? LIVE_PCM_SAMPLE_RATE, format: 'pcm', channel: 1 },
        }),
    })
    if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '')
        throw new Error(`MiniMax TTS stream failed (${res.status}): ${text.slice(0, 300)}`)
    }

    const usage: SynthesizeUsage = { characters: 0, audioMs: 0 }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    try {
        for (;;) {
            const { value, done } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            let nl: number
            while ((nl = buffer.indexOf('\n')) !== -1) {
                const line = buffer.slice(0, nl).trim()
                buffer = buffer.slice(nl + 1)
                if (!line.startsWith('data:')) continue
                const payload = line.slice(5).trim()
                if (!payload || payload === '[DONE]') continue
                let chunk: StreamChunk
                try {
                    chunk = JSON.parse(payload) as StreamChunk
                } catch {
                    continue
                }
                if (chunk.base_resp?.status_code) {
                    throw new Error(`MiniMax TTS error: ${chunk.base_resp.status_msg ?? chunk.base_resp.status_code}`)
                }
                if (chunk.data?.audio) yield new Uint8Array(Buffer.from(chunk.data.audio, 'hex'))
                if (chunk.data?.status === 2 && chunk.extra_info) {
                    usage.characters = chunk.extra_info.usage_characters ?? usage.characters
                    usage.audioMs = chunk.extra_info.audio_length ?? usage.audioMs
                }
            }
        }
    } finally {
        reader.releaseLock()
    }
    return usage
}

/**
 * Código corto de idioma de la voz (`es`) → valor de `language_boost` de
 * MiniMax (`Spanish`). Mismo mapa que Avatar Studio; lo desconocido va en
 * `auto` (MiniMax detecta).
 */
const LANGUAGE_BOOST: Record<string, string> = {
    es: 'Spanish',
    en: 'English',
    pt: 'Portuguese',
    fr: 'French',
}

export function languageBoostFor(code: string | null | undefined): string {
    if (!code) return 'auto'
    return LANGUAGE_BOOST[code.toLowerCase().slice(0, 2)] ?? 'auto'
}
