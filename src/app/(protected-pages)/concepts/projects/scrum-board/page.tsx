import ScrumBoardProvider from './_components/ScrumBoardProvider'
import Board from './_components/Board'
import getScrumboardData from '@/server/actions/getScrumboardData'
import getSrcumboardMembers from '@/server/actions/getSrcumboardMembers'

export default async function Page() {
    const data = await getScrumboardData()
    const projectMembers = await getSrcumboardMembers()

    return (
        <ScrumBoardProvider data={data} projectMembers={projectMembers}>
            <Board />
        </ScrumBoardProvider>
    )
}
