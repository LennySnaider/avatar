import { create } from 'zustand'
import type { VoiceStudioState, ClonedVoice, AudioScript, ScriptTone, ScriptTemplate } from '@/@types/voice'

const initialState = {
    voices: [] as ClonedVoice[],
    selectedVoiceId: null as string | null,
    isCloning: false,
    scripts: [] as AudioScript[],
    currentScript: '',
    currentTitle: '',
    scriptTone: 'professional' as ScriptTone,
    scriptTemplate: 'custom' as ScriptTemplate,
    scriptLanguage: 'es',
    durationTarget: 30,
    isGeneratingScript: false,
    previewAudioUrl: null as string | null,
    isGeneratingAudio: false,
    selectedVideoUrl: null as string | null,
    mergedVideoUrl: null as string | null,
    isMerging: false,
}

export const useVoiceStudioStore = create<VoiceStudioState>((set) => ({
    ...initialState,
    setVoices: (voices) => set({ voices }),
    setSelectedVoiceId: (id) => set({ selectedVoiceId: id }),
    setIsCloning: (v) => set({ isCloning: v }),
    setScripts: (scripts) => set({ scripts }),
    setCurrentScript: (text) => set({ currentScript: text }),
    setCurrentTitle: (title) => set({ currentTitle: title }),
    setScriptTone: (tone) => set({ scriptTone: tone }),
    setScriptTemplate: (template) => set({ scriptTemplate: template }),
    setScriptLanguage: (lang) => set({ scriptLanguage: lang }),
    setDurationTarget: (secs) => set({ durationTarget: secs }),
    setIsGeneratingScript: (v) => set({ isGeneratingScript: v }),
    setPreviewAudioUrl: (url) => set({ previewAudioUrl: url }),
    setIsGeneratingAudio: (v) => set({ isGeneratingAudio: v }),
    setSelectedVideoUrl: (url) => set({ selectedVideoUrl: url }),
    setMergedVideoUrl: (url) => set({ mergedVideoUrl: url }),
    setIsMerging: (v) => set({ isMerging: v }),
    reset: () => set(initialState),
}))
