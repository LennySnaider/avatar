'use client'
import { useEffect } from 'react'
import { useCalendar } from '../_store/calendarStore'
import type { CommonProps } from '@/@types/common'
import type { CalendarEvents } from '../types'

interface CalendarProviderProps extends CommonProps {
    events: CalendarEvents
}

const CalendarProvider = ({ children, events }: CalendarProviderProps) => {
    const setData = useCalendar((state) => state.setData)
    const setInitialLoading = useCalendar((state) => state.setInitialLoading)

    useEffect(() => {
        setData(events)
        setInitialLoading(false)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return <>{children}</>
}

export default CalendarProvider
