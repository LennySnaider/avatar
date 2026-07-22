import { create } from 'zustand'
import type { ReferenceImage, AvatarMeasurements, AvatarCreatorState } from '../types'

interface AvatarCreatorActions {
    // Avatar
    setAvatarId: (id: string | null) => void
    setAvatarName: (name: string) => void

    // References
    addGeneralReference: (ref: ReferenceImage) => void
    removeGeneralReference: (id: string) => void
    setFaceRef: (ref: ReferenceImage | null) => void
    setAngleRef: (ref: ReferenceImage | null) => void
    setBodyRef: (ref: ReferenceImage | null) => void
    clearAllReferences: () => void

    // Settings
    setIdentityWeight: (weight: number) => void
    setMeasurements: (measurements: AvatarMeasurements) => void
    setFaceDescription: (desc: string) => void

    // UI
    setIsLoading: (loading: boolean) => void
    setIsSaving: (saving: boolean) => void
    setIsAnalyzing: (analyzing: boolean) => void
    setIsDirty: (dirty: boolean) => void

    // Helpers
    hasReferences: () => boolean
    reset: () => void
    loadAvatar: (data: {
        id: string
        name: string
        identityWeight: number
        measurements: AvatarMeasurements
        faceDescription: string
        references: ReferenceImage[]
    }) => void
}

const initialState: AvatarCreatorState = {
    avatarId: null,
    avatarName: '',
    generalReferences: [],
    faceRef: null,
    angleRef: null,
    bodyRef: null,
    identityWeight: 85,
    measurements: { age: 25, height: 165, bodyType: 'average', bust: 90, waist: 60, hips: 90, skinTone: 5, hairColor: 'brown' },
    faceDescription: '',
    isLoading: false,
    isSaving: false,
    isAnalyzing: false,
    isDirty: false,
}

export const useAvatarCreatorStore = create<AvatarCreatorState & AvatarCreatorActions>(
    (set, get) => ({
        ...initialState,

        // Avatar
        setAvatarId: (id) => set({ avatarId: id }),
        setAvatarName: (name) => set({ avatarName: name, isDirty: true }),

        // References
        addGeneralReference: (ref) =>
            set((state) => ({
                generalReferences: [...state.generalReferences, ref],
                isDirty: true,
            })),
        removeGeneralReference: (id) =>
            set((state) => ({
                generalReferences: state.generalReferences.filter((r) => r.id !== id),
                isDirty: true,
            })),
        setFaceRef: (ref) => set({ faceRef: ref, isDirty: true }),
        setAngleRef: (ref) => set({ angleRef: ref, isDirty: true }),
        setBodyRef: (ref) => set({ bodyRef: ref, isDirty: true }),
        clearAllReferences: () =>
            set({
                generalReferences: [],
                faceRef: null,
                angleRef: null,
                bodyRef: null,
                isDirty: true,
            }),

        // Settings
        setIdentityWeight: (weight) => set({ identityWeight: weight, isDirty: true }),
        setMeasurements: (measurements) => set({ measurements, isDirty: true }),
        setFaceDescription: (desc) => set({ faceDescription: desc, isDirty: true }),

        // UI
        setIsLoading: (loading) => set({ isLoading: loading }),
        setIsSaving: (saving) => set({ isSaving: saving }),
        setIsAnalyzing: (analyzing) => set({ isAnalyzing: analyzing }),
        setIsDirty: (dirty) => set({ isDirty: dirty }),

        // Helpers
        hasReferences: () => {
            const state = get()
            return (
                state.generalReferences.length > 0 ||
                state.faceRef !== null ||
                state.angleRef !== null ||
                state.bodyRef !== null
            )
        },

        reset: () => set(initialState),

        loadAvatar: (data) => {
            const generalRefs = data.references.filter((r) => r.type === 'general')
            const faceRef = data.references.find((r) => r.type === 'face') || null
            const angleRef = data.references.find((r) => r.type === 'angle') || null
            const bodyRef = data.references.find((r) => r.type === 'body') || null

            set({
                avatarId: data.id,
                avatarName: data.name,
                identityWeight: data.identityWeight,
                measurements: data.measurements,
                faceDescription: data.faceDescription,
                generalReferences: generalRefs,
                faceRef,
                angleRef,
                bodyRef,
                isDirty: false,
            })
        },
    })
)
