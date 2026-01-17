'use client'
import { useEffect } from 'react'
import { useChatStore } from '../_store/chatStore'
import type { CommonProps } from '@/@types/common'
import type { Chats } from '../types'

interface ChatProviderProviderProps extends CommonProps {
    chats: Chats
}

const ChatProvider = ({ children, chats }: ChatProviderProviderProps) => {
    const setChats = useChatStore((state) => state.setChats)
    const setChatsFetched = useChatStore((state) => state.setChatsFetched)

    useEffect(() => {
        setChats(chats)
        setChatsFetched(true)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chats])

    return <>{children}</>
}

export default ChatProvider
