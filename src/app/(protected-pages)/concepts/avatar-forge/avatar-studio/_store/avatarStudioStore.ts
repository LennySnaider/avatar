import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { AppState } from '../types'
import type {
    ReferenceImage,
    GeneratedMedia,
    AspectRatio,
    MediaType,
    PhysicalMeasurements,
    CameraMotion,
    SubjectAction,
    VideoResolution,
    CameraShot,
} from '../types'
import type { Avatar, AIProvider, Prompt } from '@/@types/supabase'
import type {
    KlingCameraControlType,
    KlingCameraSimpleConfig,
    KlingDynamicMask,
    KlingModel,
    KlingMotionPreset,
    KlingMotionOrientation,
} from '@/@types/kling'
import {
    type DetectedTerm,
    analyzePromptForContaminants,
    removeTermFromPrompt,
} from '../_utils/promptAnalyzer'

// Safety analysis result
export interface SafetyCorrection {
    term: string
    alternatives: string[]
}

export interface PromptAnalysisResult {
    isSafe: boolean
    corrections: SafetyCorrection[]
    optimizedPrompt: string
    reason: string
}

// Video sub-mode
export type VideoSubMode = 'ANIMATE' | 'AVATAR'

interface AvatarStudioState {
    // Current Avatar
    currentAvatar: Avatar | null
    avatarId: string | null
    avatarName: string

    // Reference Images
    generalReferences: ReferenceImage[]
    faceRef: ReferenceImage | null
    angleRef: ReferenceImage | null
    bodyRef: ReferenceImage | null
    assetImages: ReferenceImage[]
    cloneImage: ReferenceImage | null // Clone Ref - clones everything except face and body type
    cloneDescription: string // Text description of clone (analyzed from image)
    poseImage: ReferenceImage | null
    poseDescription: string // Text description of pose (analyzed from image)
    placeImage: ReferenceImage | null // Place Ref - sets the scene/location
    placeDescription: string // Text description of place (analyzed from image)
    sceneImage: ReferenceImage | null // Scene Composite - literally places avatar in this scene
    videoInputImage: ReferenceImage | null

    // Avatar Settings
    identityWeight: number
    measurements: PhysicalMeasurements
    faceDescription: string

    // Generation Settings
    prompt: string
    detectedTerms: DetectedTerm[]  // Contaminating terms detected in prompt
    generationMode: MediaType
    videoSubMode: VideoSubMode
    aspectRatio: AspectRatio
    videoResolution: VideoResolution
    cameraMotion: CameraMotion
    cameraShot: CameraShot // Framing (close-up, medium, full, etc.)
    cameraAngle: CameraShot | null // Angle (low, high, dutch, etc.) - null means AI decides
    subjectAction: SubjectAction
    videoDialogue: string
    voiceStyle: string
    noMusic: boolean
    noBackgroundEffects: boolean

    // Kling-specific Settings
    klingVoiceEnabled: boolean
    klingVoiceId: string
    klingDialogue: string
    klingMotionBrushEnabled: boolean
    klingStaticMask: string | null
    klingDynamicMasks: KlingDynamicMask[]
    klingCameraControlType: KlingCameraControlType | null
    klingCameraConfig: KlingCameraSimpleConfig | null
    klingModel: KlingModel

    // Kling Motion Control (v2.6+)
    klingMotionControlEnabled: boolean
    klingMotionVideoBase64: string | null // Custom motion video (uploaded file)
    klingMotionVideoUrl: string | null // External video URL (Instagram, TikTok, etc.)
    klingPresetMotion: KlingMotionPreset | null // Preset motion selection
    klingMotionOrientation: KlingMotionOrientation
    klingKeepOriginalSound: boolean
    klingMotionDuration: '5' | '10' // Video duration in seconds

    // Provider
    providers: AIProvider[]
    activeProviderId: string | null

    // App State
    appState: AppState
    isAvatarLocked: boolean
    errorMsg: string | null

    // Gallery
    gallery: GeneratedMedia[]
    previewMedia: GeneratedMedia | null

    // Safety Analysis
    isAnalyzing: boolean
    safetyAnalysis: PromptAnalysisResult | null
    selectedRiskTerm: string | null

    // Enhancement states
    isEnhancingPrompt: boolean
    isDescribingImage: boolean

    // Montage/Studio Mode
    isMontageMode: boolean
    montageSelection: string[]
    isStitching: boolean

    // Style Popover
    showStylePopover: boolean

    // Prompt Library
    promptPresets: Prompt[]
    isPromptLibraryOpen: boolean
    showSavePromptInput: boolean
    newPromptName: string
    pinnedActionIds: string[] // IDs of pinned action presets

    // Provider Manager
    showProviderManager: boolean

    // Image Editor
    isEditorOpen: boolean
    editorImage: GeneratedMedia | null
    editorZoom: number
    editorAssets: ReferenceImage[]

    // Loading states
    isGenerating: boolean
    isSavingAvatar: boolean
    isLoadingReferences: boolean

    // Actions - Avatar
    setCurrentAvatar: (avatar: Avatar | null) => void
    setAvatarId: (id: string | null) => void
    setAvatarName: (name: string) => void

    // Actions - References
    setGeneralReferences: (refs: ReferenceImage[]) => void
    addGeneralReference: (ref: ReferenceImage) => void
    removeGeneralReference: (id: string) => void
    setFaceRef: (ref: ReferenceImage | null) => void
    setAngleRef: (ref: ReferenceImage | null) => void
    setBodyRef: (ref: ReferenceImage | null) => void
    setAssetImages: (images: ReferenceImage[]) => void
    addAssetImage: (image: ReferenceImage) => void
    removeAssetImage: (id: string) => void
    setCloneImage: (image: ReferenceImage | null) => void
    setCloneDescription: (description: string) => void
    setPoseImage: (image: ReferenceImage | null) => void
    setPoseDescription: (description: string) => void
    setPlaceImage: (image: ReferenceImage | null) => void
    setPlaceDescription: (description: string) => void
    setSceneImage: (image: ReferenceImage | null) => void
    setVideoInputImage: (image: ReferenceImage | null) => void
    clearAvatarReferences: () => void // Only clears avatar refs (general, face, angle, body)
    clearAllReferences: () => void // Clears everything including session tools

    // Actions - Avatar Settings
    setIdentityWeight: (weight: number) => void
    setMeasurements: (measurements: PhysicalMeasurements) => void
    setFaceDescription: (description: string) => void

    // Actions - Generation Settings
    setPrompt: (prompt: string) => void
    setPromptAndAnalyze: (prompt: string) => void  // Sets prompt and analyzes for contaminants
    removeDetectedTerm: (id: string) => void       // Removes a detected term from prompt
    clearDetectedTerms: () => void                 // Clears all detected terms
    getFullPrompt: () => string
    setGenerationMode: (mode: MediaType) => void
    setVideoSubMode: (mode: VideoSubMode) => void
    setAspectRatio: (ratio: AspectRatio) => void
    setVideoResolution: (resolution: VideoResolution) => void
    setCameraMotion: (motion: CameraMotion) => void
    setCameraShot: (shot: CameraShot) => void
    setCameraAngle: (angle: CameraShot | null) => void
    setSubjectAction: (action: SubjectAction) => void
    setVideoDialogue: (dialogue: string) => void
    setVoiceStyle: (style: string) => void
    setNoMusic: (noMusic: boolean) => void
    setNoBackgroundEffects: (noEffects: boolean) => void

    // Actions - Kling Settings
    setKlingVoiceEnabled: (enabled: boolean) => void
    setKlingVoiceId: (voiceId: string) => void
    setKlingDialogue: (dialogue: string) => void
    setKlingMotionBrushEnabled: (enabled: boolean) => void
    setKlingStaticMask: (mask: string | null) => void
    addKlingDynamicMask: (mask: KlingDynamicMask) => void
    removeKlingDynamicMask: (index: number) => void
    clearKlingDynamicMasks: () => void
    setKlingCameraControlType: (type: KlingCameraControlType | null) => void
    setKlingCameraConfig: (config: KlingCameraSimpleConfig | null) => void
    setKlingModel: (model: KlingModel) => void
    resetKlingSettings: () => void

    // Actions - Kling Motion Control
    setKlingMotionControlEnabled: (enabled: boolean) => void
    setKlingMotionVideoBase64: (base64: string | null) => void
    setKlingMotionVideoUrl: (url: string | null) => void
    setKlingPresetMotion: (preset: KlingMotionPreset | null) => void
    setKlingMotionOrientation: (orientation: KlingMotionOrientation) => void
    setKlingKeepOriginalSound: (keep: boolean) => void
    setKlingMotionDuration: (duration: '5' | '10') => void

    // Actions - Provider
    setProviders: (providers: AIProvider[]) => void
    setActiveProviderId: (id: string | null) => void
    setShowProviderManager: (show: boolean) => void

    // Actions - App State
    setAppState: (state: AppState) => void
    lockAvatar: () => void
    unlockAvatar: () => void
    setErrorMsg: (msg: string | null) => void

    // Actions - Gallery
    addToGallery: (media: GeneratedMedia) => void
    removeFromGallery: (id: string) => void
    setPreviewMedia: (media: GeneratedMedia | null) => void
    clearGallery: () => void

    // Actions - Safety
    setIsAnalyzing: (analyzing: boolean) => void
    setSafetyAnalysis: (analysis: PromptAnalysisResult | null) => void
    setSelectedRiskTerm: (term: string | null) => void

    // Actions - Enhancement
    setIsEnhancingPrompt: (enhancing: boolean) => void
    setIsDescribingImage: (describing: boolean) => void

    // Actions - Montage
    setIsMontageMode: (mode: boolean) => void
    toggleMontageSelection: (id: string) => void
    clearMontageSelection: () => void
    setIsStitching: (stitching: boolean) => void

    // Actions - Style Popover
    setShowStylePopover: (show: boolean) => void

    // Actions - Prompt Library
    setPromptPresets: (presets: Prompt[]) => void
    setIsPromptLibraryOpen: (open: boolean) => void
    setShowSavePromptInput: (show: boolean) => void
    setNewPromptName: (name: string) => void
    togglePinnedAction: (actionId: string) => void
    setPinnedActionIds: (ids: string[]) => void

    // Actions - Loading
    setIsGenerating: (generating: boolean) => void
    setIsSavingAvatar: (saving: boolean) => void
    setIsLoadingReferences: (loading: boolean) => void

    // Actions - Image Editor
    openEditor: (media: GeneratedMedia) => void
    closeEditor: () => void
    setEditorZoom: (zoom: number) => void
    addEditorAsset: (asset: ReferenceImage) => void
    removeEditorAsset: (id: string) => void
    clearEditorAssets: () => void
    setEditorImage: (media: GeneratedMedia | null) => void

    // Computed helpers
    hasAvatarRefs: () => boolean
    getActiveProvider: () => AIProvider | null

    // Reset
    resetStore: () => void
    loadAvatarData: (
        avatar: Avatar,
        references: ReferenceImage[],
        faceRef: ReferenceImage | null,
        angleRef: ReferenceImage | null,
        bodyRef: ReferenceImage | null
    ) => void
}

const initialMeasurements: PhysicalMeasurements = {
    age: 25,
    height: 165,
    bodyType: 'average',
    bust: 90,
    waist: 60,
    hips: 90,
    skinTone: 5, // Medium skin tone (1-9 scale)
    hairColor: 'brown', // Default hair color
}

const initialState = {
    currentAvatar: null,
    avatarId: null,
    avatarName: '',

    generalReferences: [],
    faceRef: null,
    angleRef: null,
    bodyRef: null,
    assetImages: [],
    cloneImage: null,
    cloneDescription: '',
    poseImage: null,
    poseDescription: '',
    placeImage: null,
    placeDescription: '',
    sceneImage: null,
    videoInputImage: null,

    identityWeight: 85,
    measurements: initialMeasurements,
    faceDescription: '',

    prompt: '',
    detectedTerms: [] as DetectedTerm[],
    generationMode: 'IMAGE' as MediaType,
    videoSubMode: 'ANIMATE' as VideoSubMode,
    aspectRatio: '1:1' as AspectRatio,
    videoResolution: '720p' as VideoResolution,
    cameraMotion: 'NONE' as CameraMotion,
    cameraShot: 'AUTO' as CameraShot,
    cameraAngle: null as CameraShot | null,
    subjectAction: 'NONE' as SubjectAction,
    videoDialogue: '',
    voiceStyle: 'Realistic',
    noMusic: false,
    noBackgroundEffects: false,

    // Kling Settings Initial State
    klingVoiceEnabled: false,
    klingVoiceId: '',
    klingDialogue: '',
    klingMotionBrushEnabled: false,
    klingStaticMask: null,
    klingDynamicMasks: [] as KlingDynamicMask[],
    klingCameraControlType: null as KlingCameraControlType | null,
    klingCameraConfig: null as KlingCameraSimpleConfig | null,
    klingModel: 'kling-v1-6' as KlingModel,

    // Kling Motion Control Initial State
    klingMotionControlEnabled: false,
    klingMotionVideoBase64: null,
    klingMotionVideoUrl: null,
    klingPresetMotion: null as KlingMotionPreset | null,
    klingMotionOrientation: 'video' as KlingMotionOrientation,
    klingKeepOriginalSound: false,
    klingMotionDuration: '5' as '5' | '10',

    providers: [],
    activeProviderId: null,

    appState: AppState.IDLE,
    isAvatarLocked: false,
    errorMsg: null,

    gallery: [],
    previewMedia: null,

    isAnalyzing: false,
    safetyAnalysis: null,
    selectedRiskTerm: null,

    isEnhancingPrompt: false,
    isDescribingImage: false,

    isMontageMode: false,
    montageSelection: [],
    isStitching: false,

    showStylePopover: false,

    promptPresets: [],
    isPromptLibraryOpen: false,
    showSavePromptInput: false,
    newPromptName: '',
    pinnedActionIds: [],

    showProviderManager: false,

    isEditorOpen: false,
    editorImage: null,
    editorZoom: 100,
    editorAssets: [],

    isGenerating: false,
    isSavingAvatar: false,
    isLoadingReferences: false,
}

export const useAvatarStudioStore = create<AvatarStudioState>()(
    persist(
        (set, get) => ({
    ...initialState,

    // Actions - Avatar
    setCurrentAvatar: (avatar) => set({ currentAvatar: avatar }),
    setAvatarId: (id) => set({ avatarId: id }),
    setAvatarName: (name) => set({ avatarName: name }),

    // Actions - References
    setGeneralReferences: (refs) => set({ generalReferences: refs }),
    addGeneralReference: (ref) =>
        set((state) => ({
            generalReferences: [...state.generalReferences, ref],
        })),
    removeGeneralReference: (id) =>
        set((state) => ({
            generalReferences: state.generalReferences.filter((r) => r.id !== id),
        })),
    setFaceRef: (ref) => set({ faceRef: ref }),
    setAngleRef: (ref) => set({ angleRef: ref }),
    setBodyRef: (ref) => set({ bodyRef: ref }),
    setAssetImages: (images) => set({ assetImages: images }),
    addAssetImage: (image) =>
        set((state) => ({
            // Limit to 3 assets max
            assetImages: state.assetImages.length < 3
                ? [...state.assetImages, image]
                : state.assetImages,
        })),
    removeAssetImage: (id) =>
        set((state) => ({
            assetImages: state.assetImages.filter((i) => i.id !== id),
        })),
    setCloneImage: (image) => set({ cloneImage: image, cloneDescription: image ? get().cloneDescription : '' }),
    setCloneDescription: (description) => set({ cloneDescription: description }),
    setPoseImage: (image) => set({ poseImage: image, poseDescription: image ? get().poseDescription : '' }),
    setPoseDescription: (description) => set({ poseDescription: description }),
    setPlaceImage: (image) =>
        set({
            placeImage: image,
            placeDescription: image ? get().placeDescription : '', // Clear description when image is removed
        }),
    setPlaceDescription: (description) => set({ placeDescription: description }),
    setSceneImage: (image) => set({ sceneImage: image }),
    setVideoInputImage: (image) => set({ videoInputImage: image }),
    // Only clears avatar-specific references (when switching avatars)
    clearAvatarReferences: () =>
        set({
            generalReferences: [],
            faceRef: null,
            angleRef: null,
            bodyRef: null,
        }),
    // Clears everything including session tools (full reset)
    clearAllReferences: () =>
        set({
            generalReferences: [],
            faceRef: null,
            angleRef: null,
            bodyRef: null,
            assetImages: [],
            cloneImage: null,
            cloneDescription: '',
            poseImage: null,
            poseDescription: '',
            placeImage: null,
            placeDescription: '',
            sceneImage: null,
            videoInputImage: null,
        }),

    // Actions - Avatar Settings
    setIdentityWeight: (weight) => set({ identityWeight: weight }),
    setMeasurements: (measurements) => set({ measurements }),
    setFaceDescription: (description) => set({ faceDescription: description }),

    // Actions - Generation Settings
    setPrompt: (prompt) => set({ prompt }),
    setPromptAndAnalyze: (prompt) =>
        set(() => {
            // Analyze prompt for contaminating terms
            const detected = analyzePromptForContaminants(prompt)
            return {
                prompt,
                detectedTerms: detected,
            }
        }),
    removeDetectedTerm: (id) =>
        set((state) => {
            const term = state.detectedTerms.find((t) => t.id === id)
            if (!term) return state
            // Remove the term from the prompt
            const newPrompt = removeTermFromPrompt(state.prompt, term)
            // Re-analyze the cleaned prompt
            const newDetected = analyzePromptForContaminants(newPrompt)
            return {
                prompt: newPrompt,
                detectedTerms: newDetected,
            }
        }),
    clearDetectedTerms: () => set({ detectedTerms: [] }),
    getFullPrompt: () => {
        const state = get()
        const { prompt, measurements } = state

        // If there's no prompt, return empty
        if (!prompt.trim()) return ''

        // Build body measurements string to reinforce avatar's body type
        // This ensures Clone Ref doesn't override the avatar's physical characteristics
        // PRIORITY: Body measurements go FIRST in the prompt for maximum weight
        const bodyParts: string[] = []

        if (measurements.bodyType) {
            bodyParts.push(measurements.bodyType)
        }
        if (measurements.age) {
            bodyParts.push(`${measurements.age} years old`)
        }
        if (measurements.height) {
            bodyParts.push(`${measurements.height}cm tall`)
        }
        if (measurements.bust) {
            bodyParts.push(`bust ${measurements.bust}cm`)
        }
        if (measurements.waist) {
            bodyParts.push(`waist ${measurements.waist}cm`)
        }
        if (measurements.hips) {
            bodyParts.push(`hips ${measurements.hips}cm`)
        }

        // Body tag goes at the BEGINNING for priority
        if (bodyParts.length > 0) {
            const bodyTag = `[BODY: ${bodyParts.join(', ')}]`
            return `${bodyTag} ${prompt}`
        }

        return prompt
    },
    setGenerationMode: (mode) =>
        set((state) => ({
            generationMode: mode,
            // Clear detected terms when switching to VIDEO (only relevant for IMAGE mode)
            detectedTerms: mode === 'VIDEO' ? [] : state.detectedTerms,
        })),
    setVideoSubMode: (mode) => set({ videoSubMode: mode }),
    setAspectRatio: (ratio) => set({ aspectRatio: ratio }),
    setVideoResolution: (resolution) => set({ videoResolution: resolution }),
    setCameraMotion: (motion) => set({ cameraMotion: motion }),
    setCameraShot: (shot) => set({ cameraShot: shot }),
    setCameraAngle: (angle) => set({ cameraAngle: angle }),
    setSubjectAction: (action) => set({ subjectAction: action }),
    setVideoDialogue: (dialogue) => set({ videoDialogue: dialogue }),
    setVoiceStyle: (style) => set({ voiceStyle: style }),
    setNoMusic: (noMusic) => set({ noMusic }),
    setNoBackgroundEffects: (noEffects) => set({ noBackgroundEffects: noEffects }),

    // Actions - Kling Settings
    setKlingVoiceEnabled: (enabled) => set({ klingVoiceEnabled: enabled }),
    setKlingVoiceId: (voiceId) => set({ klingVoiceId: voiceId }),
    setKlingDialogue: (dialogue) => set({ klingDialogue: dialogue }),
    setKlingMotionBrushEnabled: (enabled) => set({ klingMotionBrushEnabled: enabled }),
    setKlingStaticMask: (mask) => set({ klingStaticMask: mask }),
    addKlingDynamicMask: (mask) =>
        set((state) => ({
            klingDynamicMasks: state.klingDynamicMasks.length < 6
                ? [...state.klingDynamicMasks, mask]
                : state.klingDynamicMasks,
        })),
    removeKlingDynamicMask: (index) =>
        set((state) => ({
            klingDynamicMasks: state.klingDynamicMasks.filter((_, i) => i !== index),
        })),
    clearKlingDynamicMasks: () => set({ klingDynamicMasks: [] }),
    setKlingCameraControlType: (type) => set({ klingCameraControlType: type }),
    setKlingCameraConfig: (config) => set({ klingCameraConfig: config }),
    setKlingModel: (model) => set({ klingModel: model }),
    resetKlingSettings: () =>
        set({
            klingVoiceEnabled: false,
            klingVoiceId: '',
            klingDialogue: '',
            klingMotionBrushEnabled: false,
            klingStaticMask: null,
            klingDynamicMasks: [],
            klingCameraControlType: null,
            klingCameraConfig: null,
            klingModel: 'kling-v1-6',
            // Motion Control reset
            klingMotionControlEnabled: false,
            klingMotionVideoBase64: null,
            klingMotionVideoUrl: null,
            klingPresetMotion: null,
            klingMotionOrientation: 'video',
            klingKeepOriginalSound: false,
            klingMotionDuration: '5',
        }),

    // Actions - Kling Motion Control
    setKlingMotionControlEnabled: (enabled) => set({ klingMotionControlEnabled: enabled }),
    setKlingMotionVideoBase64: (base64) => set({ klingMotionVideoBase64: base64, klingMotionVideoUrl: base64 ? null : get().klingMotionVideoUrl }),
    setKlingMotionVideoUrl: (url) => set({ klingMotionVideoUrl: url, klingMotionVideoBase64: url ? null : get().klingMotionVideoBase64 }),
    setKlingPresetMotion: (preset) => set({ klingPresetMotion: preset }),
    setKlingMotionOrientation: (orientation) => set({ klingMotionOrientation: orientation }),
    setKlingKeepOriginalSound: (keep) => set({ klingKeepOriginalSound: keep }),
    setKlingMotionDuration: (duration) => set({ klingMotionDuration: duration }),

    // Actions - Provider
    setProviders: (providers) => set({ providers }),
    setActiveProviderId: (id) => set({ activeProviderId: id }),
    setShowProviderManager: (show) => set({ showProviderManager: show }),

    // Actions - App State
    setAppState: (state) => set({ appState: state }),
    lockAvatar: () => set({ isAvatarLocked: true, appState: AppState.AVATAR_DEFINED }),
    unlockAvatar: () => set({ isAvatarLocked: false, appState: AppState.IDLE }),
    setErrorMsg: (msg) => set({ errorMsg: msg }),

    // Actions - Gallery
    addToGallery: (media) =>
        set((state) => ({
            gallery: [media, ...state.gallery],
        })),
    removeFromGallery: (id) =>
        set((state) => ({
            gallery: state.gallery.filter((m) => m.id !== id),
            previewMedia: state.previewMedia?.id === id ? null : state.previewMedia,
            montageSelection: state.montageSelection.filter((mid) => mid !== id),
        })),
    setPreviewMedia: (media) => set({ previewMedia: media }),
    clearGallery: () => set({ gallery: [], previewMedia: null, montageSelection: [] }),

    // Actions - Safety
    setIsAnalyzing: (analyzing) => set({ isAnalyzing: analyzing }),
    setSafetyAnalysis: (analysis) => set({ safetyAnalysis: analysis }),
    setSelectedRiskTerm: (term) => set({ selectedRiskTerm: term }),

    // Actions - Enhancement
    setIsEnhancingPrompt: (enhancing) => set({ isEnhancingPrompt: enhancing }),
    setIsDescribingImage: (describing) => set({ isDescribingImage: describing }),

    // Actions - Montage
    setIsMontageMode: (mode) =>
        set({
            isMontageMode: mode,
            montageSelection: mode ? [] : get().montageSelection,
        }),
    toggleMontageSelection: (id) =>
        set((state) => {
            const isSelected = state.montageSelection.includes(id)
            return {
                montageSelection: isSelected
                    ? state.montageSelection.filter((mid) => mid !== id)
                    : [...state.montageSelection, id],
            }
        }),
    clearMontageSelection: () => set({ montageSelection: [] }),
    setIsStitching: (stitching) => set({ isStitching: stitching }),

    // Actions - Style Popover
    setShowStylePopover: (show) => set({ showStylePopover: show }),

    // Actions - Prompt Library
    setPromptPresets: (presets) => set({ promptPresets: presets }),
    setIsPromptLibraryOpen: (open) => set({ isPromptLibraryOpen: open }),
    setShowSavePromptInput: (show) => set({ showSavePromptInput: show }),
    setNewPromptName: (name) => set({ newPromptName: name }),
    togglePinnedAction: (actionId) =>
        set((state) => ({
            pinnedActionIds: state.pinnedActionIds.includes(actionId)
                ? state.pinnedActionIds.filter((id) => id !== actionId)
                : [...state.pinnedActionIds, actionId],
        })),
    setPinnedActionIds: (ids) => set({ pinnedActionIds: ids }),

    // Actions - Loading
    setIsGenerating: (generating) => set({ isGenerating: generating }),
    setIsSavingAvatar: (saving) => set({ isSavingAvatar: saving }),
    setIsLoadingReferences: (loading) => set({ isLoadingReferences: loading }),

    // Actions - Image Editor
    openEditor: (media) => set({ isEditorOpen: true, editorImage: media, editorZoom: 100 }),
    closeEditor: () => set({ isEditorOpen: false, editorImage: null, editorZoom: 100, editorAssets: [] }),
    setEditorZoom: (zoom) => set({ editorZoom: zoom }),
    addEditorAsset: (asset) =>
        set((state) => ({
            editorAssets: [...state.editorAssets, asset],
        })),
    removeEditorAsset: (id) =>
        set((state) => ({
            editorAssets: state.editorAssets.filter((a) => a.id !== id),
        })),
    clearEditorAssets: () => set({ editorAssets: [] }),
    setEditorImage: (media) => set({ editorImage: media }),

    // Computed helpers
    hasAvatarRefs: () => {
        const state = get()
        return (
            state.generalReferences.length > 0 ||
            state.faceRef !== null ||
            state.bodyRef !== null ||
            state.angleRef !== null
        )
    },
    getActiveProvider: () => {
        const state = get()
        if (!state.activeProviderId) return null
        return state.providers.find((p) => p.id === state.activeProviderId) || null
    },

    // Reset
    resetStore: () => set(initialState),
    loadAvatarData: (avatar, references, faceRef, angleRef, bodyRef) =>
        set({
            currentAvatar: avatar,
            avatarId: avatar.id,
            avatarName: avatar.name,
            generalReferences: references.filter((r) => r.type === 'general'),
            faceRef,
            angleRef,
            bodyRef,
            identityWeight: avatar.identity_weight || 85,
            measurements: avatar.measurements || initialMeasurements,
            faceDescription: avatar.face_description || '',
            isAvatarLocked: true,
            appState: AppState.AVATAR_DEFINED,
        }),
}),
        {
            name: 'avatar-studio-storage',
            storage: createJSONStorage(() => sessionStorage),
            // Only persist gallery and preview to avoid large base64 data
            partialize: (state) => ({
                gallery: state.gallery,
                previewMedia: state.previewMedia,
            }),
        }
    )
)
