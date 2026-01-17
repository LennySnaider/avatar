import CalendarProvider from './_components/CalendarProvider'
import Calendar from './_components/Calendar'
import getCalendar from '@/server/actions/getCalendar'
import type { CalendarEvents } from './types'

export default async function Page() {
    const data = await getCalendar()

    return (
        <CalendarProvider events={data as CalendarEvents}>
            <Calendar />
        </CalendarProvider>
    )
}
