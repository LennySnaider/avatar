'use server'

import { createServerSupabaseClient } from '@/lib/supabase'
import type {
    MiniMaxFileUploadResponse,
    MiniMaxVoiceCloneResponse,
    MiniMaxTTSRequest,
    MiniMaxTTSResponse,
    MiniMaxVideoModel,
    MiniMaxVideoDuration,
    MiniMaxVideoResolution,
    MiniMaxVideoGenerationRequest,
    MiniMaxVideoTaskResponse,
    MiniMaxVideoStatusResponse,
    MiniMaxFileRetrieveResponse,
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

// ─── Image Generation (fallback provider) ────────────────

interface MiniMaxImageResponse {
    base_resp: { status_code: number; status_msg: string }
    data: { image_base64: string[] }
}

function getImageAspectRatio(aspectRatio: string): string {
    switch (aspectRatio) {
        case '1:1': return '1:1'
        case '3:4': return '3:4'
        case '4:3': return '4:3'
        case '9:16': return '9:16'
        case '16:9': return '16:9'
        default: return '1:1'
    }
}

/**
 * Generate an image using MiniMax image-01.
 * Supports subject_reference for facial consistency when a face URL is provided.
 */
export async function generateImage(params: {
    prompt: string
    aspectRatio?: string
    faceReferenceUrl?: string
}): Promise<{
    success: true
    url: string
    fullApiPrompt: string
    provider: 'minimax'
} | {
    success: false
    error: string
}> {
    const { prompt: rawPrompt, aspectRatio = '1:1', faceReferenceUrl } = params
    const prompt = rawPrompt.slice(0, 1500)

    try {
        const body: Record<string, unknown> = {
            model: 'image-01',
            prompt,
            aspect_ratio: getImageAspectRatio(aspectRatio),
            response_format: 'base64',
        }

        if (faceReferenceUrl) {
            body.subject_reference = [
                { type: 'character', image_file: faceReferenceUrl },
            ]
            console.log('[MiniMaxService] Using subject_reference for facial consistency')
        }

        console.log(`[MiniMaxService] Generating image: aspect=${aspectRatio}, prompt length=${prompt.length}`)

        const res = await fetch(`${MINIMAX_API_BASE}/image_generation`, {
            method: 'POST',
            headers: {
                ...authHeaders(),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        })

        if (!res.ok) {
            const text = await res.text()
            return { success: false, error: `MiniMax image generation failed (${res.status}): ${text}` }
        }

        const json: MiniMaxImageResponse = await res.json()

        if (json.base_resp.status_code !== 0) {
            return { success: false, error: `MiniMax image error: ${json.base_resp.status_msg}` }
        }

        const images = json.data?.image_base64
        if (!images || images.length === 0) {
            return { success: false, error: 'MiniMax returned no images' }
        }

        const dataUri = `data:image/png;base64,${images[0]}`
        console.log('[MiniMaxService] Image generation successful')

        return {
            success: true,
            url: dataUri,
            fullApiPrompt: prompt,
            provider: 'minimax',
        }
    } catch (error) {
        console.error('[MiniMaxService] Image generation failed:', error)
        const message = error instanceof Error ? error.message : 'Error desconocido en MiniMax'
        return { success: false, error: message }
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

// ─── Video Generation (Hailuo) ────────────────────────────

function normalizeVideoResolution(input?: string): MiniMaxVideoResolution {
    if (!input) return '1080P'
    const upper = input.toUpperCase()
    if (upper === '1080P') return '1080P'
    return '768P'
}

function toDataUri(base64: string, mimeType: string): string {
    if (base64.startsWith('data:')) return base64
    return `data:${mimeType};base64,${base64}`
}

async function submitVideoTask(body: MiniMaxVideoGenerationRequest): Promise<string> {
    const res = await fetch(`${MINIMAX_API_BASE}/video_generation`, {
        method: 'POST',
        headers: {
            ...authHeaders(),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    })

    if (!res.ok) {
        const text = await res.text()
        throw new Error(`MiniMax video submit failed (${res.status}): ${text}`)
    }

    const json: MiniMaxVideoTaskResponse = await res.json()
    if (json.base_resp.status_code !== 0) {
        throw new Error(`MiniMax video submit error: ${json.base_resp.status_msg}`)
    }
    return json.task_id
}

export async function pollMiniMaxVideoTask(
    taskId: string,
    options?: { maxAttempts?: number; intervalMs?: number }
): Promise<string> {
    const maxAttempts = options?.maxAttempts ?? 120
    const intervalMs = options?.intervalMs ?? 5000

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const res = await fetch(
            `${MINIMAX_API_BASE}/query/video_generation?task_id=${encodeURIComponent(taskId)}`,
            { headers: authHeaders() }
        )
        if (!res.ok) {
            const text = await res.text()
            throw new Error(`MiniMax video poll failed (${res.status}): ${text}`)
        }
        const json: MiniMaxVideoStatusResponse = await res.json()

        if (json.status === 'Success' && json.file_id) {
            return json.file_id
        }
        if (json.status === 'Fail') {
            throw new Error(
                `MiniMax video generation failed: ${json.base_resp?.status_msg || 'Unknown failure'}`
            )
        }
        await new Promise(resolve => setTimeout(resolve, intervalMs))
    }
    throw new Error('MiniMax video generation timed out after 10 minutes')
}

export async function retrieveMiniMaxFile(fileId: string): Promise<string> {
    const res = await fetch(
        `${MINIMAX_API_BASE}/files/retrieve?file_id=${encodeURIComponent(fileId)}`,
        { headers: authHeaders() }
    )
    if (!res.ok) {
        const text = await res.text()
        throw new Error(`MiniMax file retrieve failed (${res.status}): ${text}`)
    }
    const json: MiniMaxFileRetrieveResponse = await res.json()
    if (json.base_resp.status_code !== 0) {
        throw new Error(`MiniMax file retrieve error: ${json.base_resp.status_msg}`)
    }
    return json.file.download_url
}

/**
 * Download a video from a URL and re-upload to Supabase Storage.
 * MiniMax download_urls have CORS restrictions / attachment headers that
 * prevent inline playback in <video> elements, so we proxy through our own
 * bucket to get a stable, reproducible URL.
 */
async function persistVideoToSupabase(sourceUrl: string): Promise<string> {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not defined')

    const res = await fetch(sourceUrl)
    if (!res.ok) {
        throw new Error(`Failed to download MiniMax video (${res.status})`)
    }
    const buffer = Buffer.from(await res.arrayBuffer())

    const fileName = `minimax-videos/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.mp4`
    const supabase = createServerSupabaseClient()
    const { error } = await supabase.storage
        .from('generations')
        .upload(fileName, buffer, {
            contentType: 'video/mp4',
            cacheControl: '3600',
            upsert: false,
        })
    if (error) {
        console.error('[MiniMaxService] Supabase upload error:', error)
        throw new Error(`Failed to persist MiniMax video: ${error.message}`)
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/generations/${fileName}`
    console.log('[MiniMaxService] Video persisted to:', publicUrl)
    return publicUrl
}

export type MiniMaxVideoMode = 'text' | 'image' | 'subject' | 'startEnd'

export interface GenerateMiniMaxVideoParams {
    mode: MiniMaxVideoMode
    prompt: string
    firstFrameImage?: { base64: string; mimeType: string } | string
    lastFrameImage?: { base64: string; mimeType: string } | string
    characterImages?: Array<{ base64: string; mimeType: string } | string>
    model?: MiniMaxVideoModel
    duration?: MiniMaxVideoDuration
    resolution?: MiniMaxVideoResolution | string
    promptOptimizer?: boolean
}

function coerceImage(input?: { base64: string; mimeType: string } | string): string | undefined {
    if (!input) return undefined
    if (typeof input === 'string') return input
    return toDataUri(input.base64, input.mimeType)
}

/**
 * End-to-end MiniMax Hailuo video generation:
 * submit → poll until ready → retrieve download URL.
 *
 * Modes:
 * - 'text'      → prompt only
 * - 'image'     → first_frame_image + prompt (image-to-video)
 * - 'subject'   → subject_reference (1-8 images) + prompt (avatar lock)
 * - 'startEnd'  → first_frame_image + last_frame_image + prompt
 */
export async function generateVideoMiniMax(params: GenerateMiniMaxVideoParams): Promise<string> {
    const {
        mode,
        prompt,
        firstFrameImage,
        lastFrameImage,
        characterImages,
        model = 'MiniMax-Hailuo-2.3',
        duration = 6,
        resolution,
        promptOptimizer = true,
    } = params

    const body: MiniMaxVideoGenerationRequest = {
        model,
        prompt: prompt.slice(0, 2000),
        duration,
        resolution: normalizeVideoResolution(resolution),
        prompt_optimizer: promptOptimizer,
    }

    if (mode === 'image') {
        const firstUri = coerceImage(firstFrameImage)
        if (!firstUri) throw new Error('firstFrameImage is required for mode "image"')
        body.first_frame_image = firstUri
    } else if (mode === 'subject') {
        const uris = (characterImages ?? []).map(coerceImage).filter((u): u is string => !!u)
        if (uris.length === 0) {
            throw new Error('characterImages (1-8) required for mode "subject"')
        }
        body.subject_reference = [{ type: 'character', image: uris.slice(0, 8) }]
    } else if (mode === 'startEnd') {
        const firstUri = coerceImage(firstFrameImage)
        const lastUri = coerceImage(lastFrameImage)
        if (!firstUri || !lastUri) {
            throw new Error('firstFrameImage and lastFrameImage required for mode "startEnd"')
        }
        body.first_frame_image = firstUri
        body.last_frame_image = lastUri
    }

    console.log(`[MiniMaxService] Submitting video: mode=${mode}, model=${model}, duration=${duration}s`)
    const taskId = await submitVideoTask(body)
    console.log(`[MiniMaxService] Task submitted: ${taskId}`)

    const fileId = await pollMiniMaxVideoTask(taskId)
    console.log(`[MiniMaxService] Task complete, file_id=${fileId}`)

    const downloadUrl = await retrieveMiniMaxFile(fileId)
    console.log('[MiniMaxService] Video ready, persisting to storage')

    return persistVideoToSupabase(downloadUrl)
}
