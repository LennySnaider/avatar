'use client'

import type { ReactNode } from 'react'

type DocumentationWrapper = {
    children: ReactNode
    title: string
}

const DocumentationWrapper = ({ children }: DocumentationWrapper) => {
    return <>{children}</>
}

export default DocumentationWrapper
