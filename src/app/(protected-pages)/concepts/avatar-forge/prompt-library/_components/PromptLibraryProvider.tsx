'use client'

import { useEffect } from 'react'
import { usePromptLibraryStore } from '../_store/promptLibraryStore'
import type { Prompt } from '../types'

interface PromptLibraryProviderProps {
    children: React.ReactNode
    prompts: Prompt[]
}

const PromptLibraryProvider = ({ children, prompts }: PromptLibraryProviderProps) => {
    const setPrompts = usePromptLibraryStore((state) => state.setPrompts)

    useEffect(() => {
        setPrompts(prompts)
    }, [prompts, setPrompts])

    return <>{children}</>
}

export default PromptLibraryProvider
