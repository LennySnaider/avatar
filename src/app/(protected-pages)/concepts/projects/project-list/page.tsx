import ProjectListProvider from './_components/ProjectListProvider'
import ProjectListHeader from './_components/ProjectListHeader'
import ProjectListContent from './_components/ProjectListContent'
import getProjects from '@/server/actions/getProjects'
import getSrcumboardMembers from '@/server/actions/getSrcumboardMembers'

export default async function Page() {
    const projectList = await getProjects()
    const projectMembers = await getSrcumboardMembers()

    return (
        <ProjectListProvider
            projectList={projectList}
            projectMembers={projectMembers}
        >
            <div>
                <ProjectListHeader />
                <ProjectListContent />
            </div>
        </ProjectListProvider>
    )
}
