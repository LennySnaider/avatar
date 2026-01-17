import { projectData } from '@/mock/data/dashboardData'

const getProjectDashboard = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return projectData as any
}

export default getProjectDashboard
