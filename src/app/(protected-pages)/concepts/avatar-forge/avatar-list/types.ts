import type { Avatar, AvatarReference } from '@/@types/supabase'

export type AvatarWithReferences = Avatar & {
    avatar_references: AvatarReference[]
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
