import { create } from 'zustand'
import type { Activities } from '../types'

type ActivityLogState = {
    data: Activities
    loadable: boolean
    initialLoading: boolean
}

type ActivityLogAction = {
    setData: (data: Activities) => void
    setLoadable: (loadable: boolean) => void
    setInitialLoading: (initialLoading: boolean) => void
}

const initialState: ActivityLogState = {
    data: [],
    loadable: false,
    initialLoading: true,
}

export const useActivityLog = create<ActivityLogState & ActivityLogAction>(
    (set) => ({
        ...initialState,
        setData: (data) => set(() => ({ data })),
        setLoadable: (loadable) => set(() => ({ loadable })),
        setInitialLoading: (initialLoading) => set(() => ({ initialLoading })),
    }),
)
