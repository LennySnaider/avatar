import { chatHistoryData } from '@/mock/data/aiData'

const getChatHistory = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return chatHistoryData as any
}

export default getChatHistory
