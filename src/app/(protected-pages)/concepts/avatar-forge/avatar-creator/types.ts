import type { Avatar, AvatarReference, PhysicalMeasurements } from '@/@types/supabase'

export interface ReferenceImage {
    id: string
    url: string
    mimeType: string
    base64: string
    type: 'general' | 'face' | 'angle' | 'body'
    storagePath?: string
}

// Re-export for backwards compatibility
export type AvatarMeasurements = PhysicalMeasurements

export interface AvatarWithReferences extends Avatar {
    avatar_references: AvatarReference[]
    thumbnailUrl?: string
}

export interface AvatarCreatorState {
    // Avatar data
    avatarId: string | null
    avatarName: string

    // References
    generalReferences: ReferenceImage[]
    faceRef: ReferenceImage | null
    angleRef: ReferenceImage | null
    bodyRef: ReferenceImage | null

    // Settings
    identityWeight: number
    measurements: AvatarMeasurements
    faceDescription: string

    // UI State
    isLoading: boolean
    isSaving: boolean
    isAnalyzing: boolean
    isDirty: boolean
}
