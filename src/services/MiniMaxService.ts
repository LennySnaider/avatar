'use server'

import type {
    MiniMaxFileUploadResponse,
    MiniMaxVoiceCloneResponse,
    MiniMaxTTSRequest,
    MiniMaxTTSResponse,
} from '@/@types/minimax'

const MINIMAX_API_BASE = 'https://api.minimax.io/v1'

function getApiKey(): string {
    const key = process.env.MINIMAX_API_KEY
    if (!key) throw new Error('MINIMAX_API_KEY is not defined')
    return key
}

function authHeaders(): Record<string, string> {
    return {
        Authorization: `Bearer ${getApiKey()}`,
    }
}

// ─── File Upload (for voice cloning) ──────────────────────

export async function uploadAudioForCloning(
    audioBuffer: Buffer,
    filename: string
): Promise<string> {
    const formData = new FormData()
    formData.append('purpose', 'voice_clone')
    formData.append('file', new Blob([new Uint8Array(audioBuffer)]), filename)

    const res = await fetch(`${MINIMAX_API_BASE}/files/upload`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
    })

    const rawText = await res.text()

    if (!res.ok) {
        throw new Error(`MiniMax file upload failed (${res.status}): ${rawText}`)
    }

    const json: MiniMaxFileUploadResponse = JSON.parse(rawText)
    if (json.base_resp.status_code !== 0) {
        throw new Error(`MiniMax file upload error: ${json.base_resp.status_msg}`)
    }

    // Extract file_id as raw string to preserve int64 precision
    const fileIdMatch = rawText.match(/"file_id"\s*:\s*(\d+)/)
    if (!fileIdMatch) {
        throw new Error('MiniMax file upload: could not extract file_id')
    }

    return fileIdMatch[1]
}

// ─── Voice Clone ──────────────────────────────────────────

export async function cloneVoice(
    fileId: string,
    voiceId: string,
    previewText?: string
): Promise<MiniMaxVoiceCloneResponse> {
    // Build JSON manually to preserve file_id as unquoted int64
    const opts: Record<string, unknown> = {
        voice_id: voiceId,
        need_noise_reduction: true,
        need_volume_normalization: true,
    }
    if (previewText) {
        opts.text = previewText.slice(0, 300)
        opts.model = 'speech-2.8-hd'
    }

    // Inject file_id as raw number (not string) to preserve int64 precision
    const jsonBody = JSON.stringify(opts)
    const bodyWithFileId = `{"file_id":${fileId},${jsonBody.slice(1)}`

    const res = await fetch(`${MINIMAX_API_BASE}/voice_clone`, {
        method: 'POST',
        headers: {
            ...authHeaders(),
            'Content-Type': 'application/json',
        },
        body: bodyWithFileId,
    })

    if (!res.ok) {
        const text = await res.text()
        throw new Error(`MiniMax voice clone failed (${res.status}): ${text}`)
    }

    const json: MiniMaxVoiceCloneResponse = await res.json()
    if (json.base_resp.status_code !== 0) {
        throw new Error(`MiniMax voice clone error: ${json.base_resp.status_msg}`)
    }

    return json
}

// ─── Text-to-Speech ───────────────────────────────────────

export async function textToSpeech(params: {
    text: string
    voiceId: string
    speed?: number
    pitch?: number
    emotion?: MiniMaxTTSRequest['voice_setting']['emotion']
    language?: string
}): Promise<{ audioBuffer: Buffer; durationMs: number; characters: number }> {
    const body: MiniMaxTTSRequest = {
        model: 'speech-2.8-hd',
        text: params.text,
        stream: false,
        output_format: 'hex',
        language_boost: params.language || null,
        voice_setting: {
            voice_id: params.voiceId,
            speed: params.speed ?? 1.0,
            vol: 1.0,
            pitch: params.pitch ?? 0,
            emotion: params.emotion,
        },
        audio_setting: {
            sample_rate: 32000,
            bitrate: 128000,
            format: 'mp3',
            channel: 1,
        },
    }

    const res = await fetch(`${MINIMAX_API_BASE}/t2a_v2`, {
        method: 'POST',
        headers: {
            ...authHeaders(),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    })

    if (!res.ok) {
        const text = await res.text()
        throw new Error(`MiniMax TTS failed (${res.status}): ${text}`)
    }

    const json: MiniMaxTTSResponse = await res.json()
    if (json.base_resp.status_code !== 0) {
        throw new Error(`MiniMax TTS error: ${json.base_resp.status_msg}`)
    }

    // Convert hex string to Buffer
    const audioBuffer = Buffer.from(json.data.audio, 'hex')

    return {
        audioBuffer,
        durationMs: json.extra_info.audio_length,
        characters: json.extra_info.usage_characters,
    }
}

// ─── Generate voice_id from user input ────────────────────

/** MiniMax requires: min 8 chars, starts with letter, alphanumeric only */
export async function generateVoiceId(userId: string, voiceName: string): Promise<string> {
    const clean = voiceName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
    const prefix = clean.length >= 4 ? clean.slice(0, 4) : 'voice'
    const suffix = userId.replace(/-/g, '').slice(0, 8)
    const ts = Date.now().toString(36)
    return `pa${prefix}${suffix}${ts}`
}
