import IssueProvider from './_components/IssueProvider'
import Issue from './_components/Issue'
import NotFound from '@/components/shared/NotFound'
import getTask from '@/server/actions/getTask'
import getSrcumboardMembers from '@/server/actions/getSrcumboardMembers'
import isEmpty from 'lodash/isEmpty'

export default async function Page(props: { params: Promise<{ id: string }> }) {
    const params = await props.params

    const data = await getTask(params)
    const memberList = await getSrcumboardMembers()

    if (isEmpty(data)) {
        return (
            <div className="h-full flex flex-col items-center justify-center">
                <NotFound message="No issue found!" />
            </div>
        )
    }

    return (
        <IssueProvider issueData={data} memberList={memberList}>
            <Issue />
        </IssueProvider>
    )
}
