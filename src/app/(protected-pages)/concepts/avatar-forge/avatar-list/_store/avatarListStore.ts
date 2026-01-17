import { create } from 'zustand'
import type { AvatarListStore, AvatarWithReferences } from '../types'

const initialState = {
    avatarList: [] as AvatarWithReferences[],
    selectedAvatars: [] as AvatarWithReferences[],
    initialLoading: true,
    searchQuery: '',
}

export const useAvatarListStore = create<AvatarListStore>((set, get) => ({
    ...initialState,

    setAvatarList: (avatarList) => set({ avatarList }),

    setSelectedAvatars: (selectedAvatars) => set({ selectedAvatars }),

    toggleSelectAvatar: (avatar) => {
        const { selectedAvatars } = get()
        const isSelected = selectedAvatars.some((a) => a.id === avatar.id)

        if (isSelected) {
            set({
                selectedAvatars: selectedAvatars.filter(
                    (a) => a.id !== avatar.id
                ),
            })
        } else {
            set({ selectedAvatars: [...selectedAvatars, avatar] })
        }
    },

    selectAllAvatars: () => {
        const { avatarList } = get()
        set({ selectedAvatars: [...avatarList] })
    },

    clearSelection: () => set({ selectedAvatars: [] }),

    setInitialLoading: (initialLoading) => set({ initialLoading }),

    setSearchQuery: (searchQuery) => set({ searchQuery }),

    deleteAvatar: (id) => {
        const { avatarList, selectedAvatars } = get()
        set({
            avatarList: avatarList.filter((a) => a.id !== id),
            selectedAvatars: selectedAvatars.filter((a) => a.id !== id),
        })
    },

    updateAvatar: (id, updates) => {
        const { avatarList, selectedAvatars } = get()
        set({
            avatarList: avatarList.map((a) =>
                a.id === id ? { ...a, ...updates } : a
            ),
            selectedAvatars: selectedAvatars.map((a) =>
                a.id === id ? { ...a, ...updates } : a
            ),
        })
    },
}))
