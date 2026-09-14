import type { Avatar, AvatarReference } from '@/@types/supabase'

export type AvatarWithReferences = Avatar & {
    avatar_references: AvatarReference[]
    /** Voz principal embebida por la FK `default_voice_id` (solo el nombre,
     * para el badge de la tarjeta). Null cuando el avatar no tiene voz. */
    default_voice?: { name: string } | null
    /**
     * Miniatura YA resuelta en el servidor por `getAvatars` (cara → angle →
     * general; para R2 es la URL pública directa).
     *
     * Estaba calculada y viajaba hasta aquí desde el principio, pero el tipo
     * no la declaraba y `getAvatars` la adjuntaba con un cast, así que era
     * invisible para el compilador y la tarjeta se la refabricaba descargando
     * la imagen entera y pasándola por canvas. Undefined = ningún candidato
     * dio URL.
     */
    thumbnailUrl?: string
}

export interface AvatarListState {
    avatarList: AvatarWithReferences[]
    selectedAvatars: AvatarWithReferences[]
    initialLoading: boolean
    searchQuery: string
}

export interface AvatarListActions {
    setAvatarList: (list: AvatarWithReferences[]) => void
    setSelectedAvatars: (avatars: AvatarWithReferences[]) => void
    toggleSelectAvatar: (avatar: AvatarWithReferences) => void
    selectAllAvatars: () => void
    clearSelection: () => void
    setInitialLoading: (loading: boolean) => void
    setSearchQuery: (query: string) => void
    deleteAvatar: (id: string) => void
    updateAvatar: (id: string, updates: Partial<AvatarWithReferences>) => void
}

export type AvatarListStore = AvatarListState & AvatarListActions
