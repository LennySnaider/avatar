'use client'
import { useState } from 'react'
import CalendarView from '@/components/shared/CalendarView'
import Container from '@/components/shared/Container'
import EventDialog from './EventDialog'
import { useCalendar } from '../_store/calendarStore'
import cloneDeep from 'lodash/cloneDeep'
import dayjs from 'dayjs'
import type { SelectedCell, CalendarEventParam } from '../types'
import type {
    EventDropArg,
    EventClickArg,
    DateSelectArg,
} from '@fullcalendar/core'

const Calendar = () => {
    const [dialogOpen, setDialogOpen] = useState(false)

    const [selectedCell, setSelectedCell] = useState<SelectedCell>({
        type: '',
    })

    const events = useCalendar((state) => state.data)
    const setEvents = useCalendar((state) => state.setData)

    const handleCellSelect = (event: DateSelectArg) => {
        const { start, end } = event
        setSelectedCell({
            type: 'NEW',
            start: dayjs(start).format(),
            end: dayjs(end).format(),
        })
        setDialogOpen(true)
    }

    const handleEventClick = (arg: EventClickArg) => {
        const { start, end, id, title, extendedProps } = arg.event

        setSelectedCell({
            type: 'EDIT',
            eventColor: extendedProps.eventColor,
            title,
            start: start ? dayjs(start).toISOString() : undefined,
            end: end ? dayjs(end).toISOString() : undefined,
            id,
        })
        setDialogOpen(true)
    }

    const handleEventChange = (arg: EventDropArg) => {
        const newEvents = cloneDeep(events)?.map((event) => {
            if (arg.event.id === event.id) {
                const { id, extendedProps, start, end, title } = arg.event
                event = {
                    id,
                    start: dayjs(start).format(),
                    end: dayjs(end).format(),
                    title,
                    eventColor: extendedProps.eventColor,
                }
            }
            return event
        })
        setEvents(newEvents)
    }

    const handleSubmit = (data: CalendarEventParam, type: string) => {
        let newEvents = cloneDeep(events)
        if (type === 'NEW') {
            newEvents?.push(data)
        }

        if (type === 'EDIT') {
            newEvents = newEvents?.map((event) => {
                if (data.id === event.id) {
                    event = data
                }
                return event
            })
        }
        setEvents(newEvents)
    }

    return (
        <Container className="h-full">
            <CalendarView
                editable
                selectable
                events={events}
                eventClick={handleEventClick}
                select={handleCellSelect}
                eventDrop={handleEventChange}
            />
            <EventDialog
                open={dialogOpen}
                selected={selectedCell}
                submit={handleSubmit}
                onDialogOpen={setDialogOpen}
            />
        </Container>
    )
}

export default Calendar
