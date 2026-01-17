import { tasksData } from '@/mock/data/projectsData'

async function getTasks() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return tasksData as any
}

export default getTasks
