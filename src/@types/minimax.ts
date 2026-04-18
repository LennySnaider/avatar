// ─── File Upload ───────────────────────────────────────────
export interface MiniMaxFileUploadResponse {
    file: {
        file_id: string
        filename: string
        bytes: number
        created_at: number
        purpose: string
    }
    base_resp: {
        status_code: number
        status_msg: string
    }
}

// ─── Voice Clone ───────────────────────────────────────────
export interface MiniMaxVoiceCloneRequest {
    file_id: string
    voice_id: string
    /** Optional preview text, max 300 chars */
    text?: string
    model?: 'speech-2.8-hd' | 'speech-2.6-hd' | 'speech-02-hd'
    need_noise_reduction?: boolean
    need_volume_normalization?: boolean
    accuracy?: number
}

export interface MiniMaxVoiceCloneResponse {
    base_resp: {
        status_code: number
        status_msg: string
    }
    /** Hex-encoded preview audio (if text was provided) */
    data?: {
        audio?: string
    }
}

// ─── Text-to-Audio (T2A) ──────────────────────────────────
export type MiniMaxTTSModel =
    | 'speech-2.8-hd'
    | 'speech-2.8-turbo'
    | 'speech-2.6-hd'
    | 'speech-2.6-turbo'
    | 'speech-02-hd'
    | 'speech-02-turbo'

export type MiniMaxEmotion =
    | 'happy' | 'sad' | 'angry' | 'fearful'
    | 'disgusted' | 'surprised' | 'calm'
    | 'fluent' | 'whisper'

export type MiniMaxAudioFormat = 'mp3' | 'pcm' | 'flac' | 'wav'

export interface MiniMaxTTSRequest {
    model: MiniMaxTTSModel
    text: string
    stream?: boolean
    output_format?: 'url' | 'hex'
    language_boost?: string | null
    voice_setting: {
        voice_id: string
        speed?: number      // 0.5-2, default 1.0
        vol?: number        // 0-10, default 1.0
        pitch?: number      // -12 to 12, default 0
        emotion?: MiniMaxEmotion
    }
    audio_setting?: {
        sample_rate?: 8000 | 16000 | 22050 | 24000 | 32000 | 44100
        bitrate?: 32000 | 64000 | 128000 | 256000
        format?: MiniMaxAudioFormat
        channel?: 1 | 2
    }
}

export interface MiniMaxTTSResponse {
    data: {
        audio: string   // hex-encoded audio bytes
        status: 1 | 2   // 1=synthesizing, 2=completed
    }
    extra_info: {
        audio_length: number     // ms
        audio_sample_rate: number
        audio_size: number       // bytes
        bitrate: number
        audio_format: string
        audio_channel: number
        usage_characters: number
        word_count: number
    }
    trace_id: string
    base_resp: {
        status_code: number
        status_msg: string
    }
}

// ─── Video Generation ─────────────────────────────────────
export type MiniMaxVideoModel =
    | 'MiniMax-Hailuo-2.3'
    | 'MiniMax-Hailuo-2.3-Fast'
    | 'MiniMax-Hailuo-02'
    | 'I2V-01-Director'

export type MiniMaxVideoDuration = 6 | 10
export type MiniMaxVideoResolution = '768P' | '1080P'

export interface MiniMaxSubjectReference {
    type: 'character'
    image: string[] // Public URLs or base64 data URIs (1-8 items)
}

export interface MiniMaxVideoGenerationRequest {
    model: MiniMaxVideoModel
    prompt: string
    first_frame_image?: string // URL or data URI (image-to-video)
    last_frame_image?: string // URL or data URI (start/end frame)
    subject_reference?: MiniMaxSubjectReference[] // Avatar lock
    duration?: MiniMaxVideoDuration
    resolution?: MiniMaxVideoResolution
    prompt_optimizer?: boolean
    callback_url?: string
}

export interface MiniMaxVideoTaskResponse {
    task_id: string
    base_resp: {
        status_code: number
        status_msg: string
    }
}

export type MiniMaxVideoStatus = 'Queueing' | 'Preparing' | 'Processing' | 'Success' | 'Fail'

export interface MiniMaxVideoStatusResponse {
    task_id: string
    status: MiniMaxVideoStatus
    file_id?: string
    video_width?: number
    video_height?: number
    base_resp: {
        status_code: number
        status_msg: string
    }
}

export interface MiniMaxFileRetrieveResponse {
    file: {
        file_id: string
        bytes: number
        filename: string
        download_url: string
        backup_download_url?: string
    }
    base_resp: {
        status_code: number
        status_msg: string
    }
}

// ─── Error codes ───────────────────────────────────────────
export const MINIMAX_ERROR_CODES: Record<number, string> = {
    0: 'Success',
    1000: 'Unknown error',
    1001: 'Timeout',
    1002: 'Rate limit exceeded',
    1004: 'Authentication failure',
    1042: 'Illegal characters exceeded 10%',
} as const
