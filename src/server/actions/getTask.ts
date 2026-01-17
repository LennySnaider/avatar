import { issueData } from '@/mock/data/projectsData'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const getTask = (_queryParams: {
    [key: string]: string | string[] | undefined
}) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return issueData as any
}

export default getTask
