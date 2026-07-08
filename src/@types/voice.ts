/** Ajustes de entrega del TTS MiniMax guardados por voz. */
export interface VoiceTtsSettings {
    /** 0.5 (lento) a 2 (rápido); default 1. */
    speed?: number
    /** -12 (grave) a 12 (agudo); default 0. */
    pitch?: number
    /** Tono emocional; omitido = auto. */
    emotion?: 'happy' | 'sad' | 'angry' | 'fearful' | 'disgusted' | 'surprised' | 'calm'
}

export interface ClonedVoice {
    id: string
    user_id: string
    avatar_id: string | null
    name: string
    provider: 'minimax'
    provider_voice_id: string
    sample_audio_url: string
    language: string
    status: 'cloning' | 'ready' | 'failed'
    tts_settings: VoiceTtsSettings | null
    created_at: string
    updated_at: string
}

export type ClonedVoiceInsert = Omit<ClonedVoice, 'id' | 'created_at' | 'updated_at'>
export type ClonedVoiceUpdate = Partial<Pick<ClonedVoice, 'name' | 'avatar_id' | 'status' | 'tts_settings'>>

export type ScriptTone = 'professional' | 'casual' | 'funny' | 'persuasive'
export type ScriptTemplate =
    | 'property-tour' | 'product-review' | 'ugc-ad'
    | 'greeting' | 'tutorial' | 'custom'

export interface AudioScript {
    id: string
    user_id: string
    generation_id: string | null
    title: string
    script_text: string
    language: string
    tone: ScriptTone
    duration_target_seconds: number
    template_type: ScriptTemplate
    context: Record<string, unknown>
    created_at: string
}

export type AudioScriptInsert = Omit<AudioScript, 'id' | 'created_at'>

export interface ScriptGenerateParams {
    template: ScriptTemplate
    tone: ScriptTone
    language: string
    durationSeconds: number
    context: {
        productName?: string
        productDescription?: string
        targetAudience?: string
        cta?: string
        customInstructions?: string
    }
}

export interface VoiceStudioState {
    // Voices
    voices: ClonedVoice[]
    selectedVoiceId: string | null
    isCloning: boolean

    // Scripts
    scripts: AudioScript[]
    currentScript: string
    currentTitle: string
    scriptTone: ScriptTone
    scriptTemplate: ScriptTemplate
    scriptLanguage: string
    durationTarget: number
    isGeneratingScript: boolean

    // TTS Preview
    previewAudioUrl: string | null
    isGeneratingAudio: boolean

    // Lipsync (antes "Merge")
    selectedVideoUrl: string | null
    lipsyncedVideoUrl: string | null
    isLipsyncing: boolean

    // Voice <-> avatar default overrides (avatarId -> voiceId)
    defaultVoiceOverrides: Record<string, string>

    // Actions
    setVoices: (voices: ClonedVoice[]) => void
    setSelectedVoiceId: (id: string | null) => void
    setIsCloning: (v: boolean) => void
    setScripts: (scripts: AudioScript[]) => void
    setCurrentScript: (text: string) => void
    setCurrentTitle: (title: string) => void
    setScriptTone: (tone: ScriptTone) => void
    setScriptTemplate: (template: ScriptTemplate) => void
    setScriptLanguage: (lang: string) => void
    setDurationTarget: (secs: number) => void
    setIsGeneratingScript: (v: boolean) => void
    setPreviewAudioUrl: (url: string | null) => void
    setIsGeneratingAudio: (v: boolean) => void
    setSelectedVideoUrl: (url: string | null) => void
    setLipsyncedVideoUrl: (url: string | null) => void
    setIsLipsyncing: (v: boolean) => void
    setDefaultVoiceOverride: (avatarId: string, voiceId: string) => void
    reset: () => void
}
