import { scrumboardData } from '@/mock/data/projectsData'

const getScrumboardData = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return scrumboardData as any
}

export default getScrumboardData
