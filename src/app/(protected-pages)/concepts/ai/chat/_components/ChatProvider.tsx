'use client'

import { useEffect } from 'react'
import { usGenerativeChatStore } from '../_store/generativeChatStore'
import type { CommonProps } from '@/@types/common'
import type { ChatHistories } from '../types'

type ChatProviderProps = CommonProps & {
    chatHistory: ChatHistories
}

const ChatProvider = ({ children, chatHistory }: ChatProviderProps) => {
    const setChatHistory = usGenerativeChatStore(
        (state) => state.setChatHistory,
    )

    useEffect(() => {
        setChatHistory(chatHistory)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chatHistory])

    return <>{children} </>
}

export default ChatProvider
