/**
 * Speech-to-text de UNA frase del visitante (el navegador ya detectó el
 * silencio y manda el WAV completo). Dos backends, elegidos por
 * `LIVE_STT_PROVIDER` (default `minimax`) o por avatar (`stt_provider`):
 *
 *  - `minimax`: `POST /v1/speech_to_text` (modelo `asr-1.0`, multipart).
 *    Español soportado; acepta wav/mp3/ogg/opus, NO pcm crudo ni webm.
 *    Misma MINIMAX_API_KEY que la voz clonada.
 *  - `gemini`: respaldo con la misma GEMINI_API_KEY del agente — el modelo
 *    utilitario transcribe el audio en línea (`inlineData`).
 *
 * SÓLO SERVIDOR. Sin base de datos: recibe bytes y devuelve texto.
 */
import { GoogleGenAI } from '@google/genai'
import { AGENT_UTILITY_MODEL } from '@/lib/agent/models'

export type SttProvider = 'minimax' | 'gemini'

export interface TranscribeInput {
    audio: Uint8Array
    /** `audio/wav` normalmente; se pasa tal cual al proveedor. */
    mimeType: string
    /** BCP-47 corto (`es`, `en`). Sólo una pista: sin él, detección automática. */
    languageHint?: string | null
    provider?: SttProvider | null
}

export interface TranscribeResult {
    text: string
    provider: SttProvider
    durationMs: number
}

const MINIMAX_STT_URL = 'https://api.minimax.io/v1/speech_to_text'

export function defaultSttProvider(): SttProvider {
    return process.env.LIVE_STT_PROVIDER === 'gemini' ? 'gemini' : 'minimax'
}

export async function transcribeUtterance(input: TranscribeInput): Promise<TranscribeResult> {
    const provider = input.provider ?? defaultSttProvider()
    const startedAt = Date.now()
    const text = provider === 'gemini' ? await viaGemini(input) : await viaMiniMax(input)
    return { text: text.trim(), provider, durationMs: Date.now() - startedAt }
}

async function viaMiniMax(input: TranscribeInput): Promise<string> {
    const key = process.env.MINIMAX_API_KEY
    if (!key) throw new Error('MINIMAX_API_KEY is not defined')
    const form = new FormData()
    form.append('model', 'asr-1.0')
    form.append('file', new Blob([input.audio as BlobPart], { type: input.mimeType }), 'utterance.wav')
    form.append('response_format', 'json')
    if (input.languageHint) form.append('language', input.languageHint)
    const res = await fetch(MINIMAX_STT_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body: form,
    })
    const raw = await res.text()
    if (!res.ok) throw new Error(`MiniMax STT failed (${res.status}): ${raw.slice(0, 300)}`)
    let json: { text?: string; base_resp?: { status_code?: number; status_msg?: string } }
    try {
        json = JSON.parse(raw) as typeof json
    } catch {
        throw new Error('MiniMax STT: respuesta no es JSON')
    }
    if (json.base_resp && json.base_resp.status_code && json.base_resp.status_code !== 0) {
        throw new Error(`MiniMax STT error: ${json.base_resp.status_msg ?? json.base_resp.status_code}`)
    }
    return json.text ?? ''
}

async function viaGemini(input: TranscribeInput): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error('GEMINI_API_KEY is not defined')
    const ai = new GoogleGenAI({ apiKey })
    const hint = input.languageHint ? ` The speaker most likely speaks "${input.languageHint}".` : ''
    const res = await ai.models.generateContent({
        model: AGENT_UTILITY_MODEL,
        contents: [
            {
                role: 'user',
                parts: [
                    { inlineData: { mimeType: input.mimeType, data: Buffer.from(input.audio).toString('base64') } },
                    {
                        text:
                            'Transcribe this audio verbatim in the language spoken. Return ONLY the words, ' +
                            'no quotes, no commentary. If there is no speech, return an empty string.' +
                            hint,
                    },
                ],
            },
        ],
    })
    return res.text ?? ''
}
