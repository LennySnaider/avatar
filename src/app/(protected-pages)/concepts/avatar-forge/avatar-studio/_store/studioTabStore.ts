import { create } from 'zustand'

/**
 * Active tab of the Avatar Studio hub (Avatar Studio / Flow Editor). Lives in
 * a store (not StudioTabs local state) so other parts of the studio can
 * switch tabs — e.g. the gallery's "Send to flow" action jumps to the Flow
 * Editor with the picked media preloaded.
 */
interface StudioTabStore {
    activeTab: string
    setActiveTab: (tab: string) => void
}

export const useStudioTabStore = create<StudioTabStore>()((set) => ({
    activeTab: 'avatar-studio',
    setActiveTab: (activeTab) => set({ activeTab }),
}))
