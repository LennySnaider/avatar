import ActivityLogProvider from './_components/ActivityLogProvider'
import ActivityLog from './_components/ActivityLog'
import getLogs from '@/server/actions/getLogs'
import type { Activities } from './types'

export default async function Page() {
    const resp = await getLogs()

    return (
        <ActivityLogProvider
            data={resp.data as Activities}
            loadable={resp.loadable}
        >
            <ActivityLog />
        </ActivityLogProvider>
    )
}
