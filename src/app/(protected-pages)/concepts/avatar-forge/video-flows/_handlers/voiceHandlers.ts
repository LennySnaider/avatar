import type { VideoNodeHandler } from '../_engine/types'
import type { ScriptTemplate, ScriptTone } from '@/@types/voice'
import * as ScriptService from '@/services/ScriptService'
import * as MiniMaxService from '@/services/MiniMaxService'

export const scriptGenerator: VideoNodeHandler = async (node, inputs) => {
    const topic =
        (inputs.topic as string) ??
        (inputs.description as string) ??
        ''
    const config = node.data.config

    const script = await ScriptService.generateScript({
        template: (config.template as ScriptTemplate) ?? 'custom',
        tone: (config.tone as ScriptTone) ?? 'professional',
        language: (config.language as string) ?? 'es',
        durationSeconds: (config.durationSeconds as number) ?? 30,
        context: {
            customInstructions: topic,
        },
    })

    return {
        output: {
            script,
            duration: config.durationSeconds ?? 30,
        },
    }
}

// The TTS server action returns a Node Buffer, which reaches the browser as a
// plain byte payload — convert without relying on a client-side Buffer polyfill.
function bytesToBase64(data: unknown): string {
    let bytes: Uint8Array
    if (data instanceof Uint8Array) {
        bytes = data
    } else if (data instanceof ArrayBuffer) {
        bytes = new Uint8Array(data)
    } else if (Array.isArray(data)) {
        bytes = Uint8Array.from(data)
    } else if (
        data &&
        typeof data === 'object' &&
        Array.isArray((data as { data?: number[] }).data)
    ) {
        // JSON-serialized Buffer shape: { type: 'Buffer', data: [...] }
        bytes = Uint8Array.from((data as { data: number[] }).data)
    } else {
        throw new Error('Unsupported audio payload from TTS service')
    }

    let binary = ''
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
    }
    return btoa(binary)
}

export const textToSpeech: VideoNodeHandler = async (node, inputs) => {
    const text =
        (inputs.text as string) ||
        (inputs.script as string) ||
        ''
    if (!text) throw new Error('No text for speech generation')

    const config = node.data.config
    const voiceId = config.voiceId as string
    if (!voiceId) throw new Error('No voice selected')

    const result = await MiniMaxService.textToSpeech({
        text,
        voiceId,
        speed: (config.speed as number) ?? 1.0,
        language: config.language as string | undefined,
    })

    // Convert raw bytes to a data URI so downstream nodes (and the UI) can
    // consume a URL rather than a byte buffer that doesn't survive JSON.
    const base64 = bytesToBase64(result.audioBuffer)
    const audioUrl = `data:audio/mp3;base64,${base64}`

    return {
        output: {
            audioUrl,
            duration: Math.round(result.durationMs / 1000),
        },
    }
}
