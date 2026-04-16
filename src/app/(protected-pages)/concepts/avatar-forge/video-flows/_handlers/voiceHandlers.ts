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

export const textToSpeech: VideoNodeHandler = async (node, inputs) => {
    const text =
        (inputs.script as string) ??
        (inputs.text as string) ??
        ''
    if (!text) throw new Error('No text for speech generation')

    const config = node.data.config
    const voiceId = config.voiceId as string
    if (!voiceId) throw new Error('No voice selected')

    const result = await MiniMaxService.textToSpeech({
        text,
        voiceId,
        speed: (config.speed as number) ?? 1.0,
    })

    return {
        output: {
            audioBuffer: result.audioBuffer,
            durationMs: result.durationMs,
        },
    }
}
