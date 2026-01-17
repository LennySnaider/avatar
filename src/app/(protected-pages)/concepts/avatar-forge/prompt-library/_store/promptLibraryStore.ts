import { create } from 'zustand'
import type { Prompt, MediaType } from '../types'

interface PromptLibraryState {
    prompts: Prompt[]
    filteredPrompts: Prompt[]
    searchQuery: string
    mediaTypeFilter: MediaType | 'ALL'
    isLoading: boolean

    setPrompts: (prompts: Prompt[]) => void
    addPrompt: (prompt: Prompt) => void
    deletePrompt: (id: string) => void
    setSearchQuery: (query: string) => void
    setMediaTypeFilter: (filter: MediaType | 'ALL') => void
    setIsLoading: (loading: boolean) => void
}

const filterPrompts = (
    prompts: Prompt[],
    searchQuery: string,
    mediaTypeFilter: MediaType | 'ALL'
): Prompt[] => {
    let filtered = prompts

    if (searchQuery) {
        const query = searchQuery.toLowerCase()
        filtered = filtered.filter(
            (p) =>
                p.name.toLowerCase().includes(query) ||
                p.text.toLowerCase().includes(query)
        )
    }

    if (mediaTypeFilter !== 'ALL') {
        filtered = filtered.filter((p) => p.media_type === mediaTypeFilter)
    }

    return filtered
}

export const usePromptLibraryStore = create<PromptLibraryState>((set, get) => ({
    prompts: [],
    filteredPrompts: [],
    searchQuery: '',
    mediaTypeFilter: 'ALL',
    isLoading: true,

    setPrompts: (prompts) =>
        set({
            prompts,
            filteredPrompts: filterPrompts(prompts, get().searchQuery, get().mediaTypeFilter),
            isLoading: false,
        }),

    addPrompt: (prompt) => {
        const newPrompts = [prompt, ...get().prompts]
        set({
            prompts: newPrompts,
            filteredPrompts: filterPrompts(newPrompts, get().searchQuery, get().mediaTypeFilter),
        })
    },

    deletePrompt: (id) => {
        const newPrompts = get().prompts.filter((p) => p.id !== id)
        set({
            prompts: newPrompts,
            filteredPrompts: filterPrompts(newPrompts, get().searchQuery, get().mediaTypeFilter),
        })
    },

    setSearchQuery: (query) =>
        set({
            searchQuery: query,
            filteredPrompts: filterPrompts(get().prompts, query, get().mediaTypeFilter),
        }),

    setMediaTypeFilter: (filter) =>
        set({
            mediaTypeFilter: filter,
            filteredPrompts: filterPrompts(get().prompts, get().searchQuery, filter),
        }),

    setIsLoading: (loading) => set({ isLoading: loading }),
}))
