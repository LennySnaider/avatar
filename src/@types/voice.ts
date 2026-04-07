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
    created_at: string
    updated_at: string
}

export type ClonedVoiceInsert = Omit<ClonedVoice, 'id' | 'created_at' | 'updated_at'>
export type ClonedVoiceUpdate = Partial<Pick<ClonedVoice, 'name' | 'avatar_id' | 'status'>>

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

    // Merge
    selectedVideoUrl: string | null
    mergedVideoUrl: string | null
    isMerging: boolean

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
    setMergedVideoUrl: (url: string | null) => void
    setIsMerging: (v: boolean) => void
    reset: () => void
}
