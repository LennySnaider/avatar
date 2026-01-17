'use client'

import ChatList from './ChatList'
import { useChatStore } from '../_store/chatStore'
import classNames from '@/utils/classNames'

const ChatSidebar = () => {
    const selectedChat = useChatStore((state) => state.selectedChat)

    return (
        <div
            className={classNames(
                'w-full md:w-[300px] md:block',
                selectedChat.id && 'hidden',
            )}
        >
            <ChatList />
        </div>
    )
}

export default ChatSidebar
