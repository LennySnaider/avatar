import TasksProvider from './_components/TasksProvider'
import TasksHeader from './_components/TasksHeader'
import TaskList from './_components/TaskList'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import getTasks from '@/server/actions/getTasks'
import getSrcumboardMembers from '@/server/actions/getSrcumboardMembers'

export default async function Page() {
    const data = await getTasks()
    const projectMembers = await getSrcumboardMembers()

    return (
        <TasksProvider data={data} projectMembers={projectMembers}>
            <AdaptiveCard>
                <TasksHeader />
                <div className="my-8">
                    <TaskList />
                </div>
            </AdaptiveCard>
        </TasksProvider>
    )
}
