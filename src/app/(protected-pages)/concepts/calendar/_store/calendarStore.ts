import { create } from 'zustand'
import type { CalendarEvents } from '../types'

type ActivityLogState = {
    data: CalendarEvents
    initialLoading: boolean
}

type ActivityLogAction = {
    setData: (data: CalendarEvents) => void
    setInitialLoading: (initialLoading: boolean) => void
}

const initialState: ActivityLogState = {
    data: [],
    initialLoading: true,
}

export const useCalendar = create<ActivityLogState & ActivityLogAction>(
    (set) => ({
        ...initialState,
        setData: (data) => set(() => ({ data })),
        setInitialLoading: (initialLoading) => set(() => ({ initialLoading })),
    }),
)
