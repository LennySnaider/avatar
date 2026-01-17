import { chatList } from '@/mock/data/chatData'

const getChatList = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return chatList as any
}

export default getChatList
