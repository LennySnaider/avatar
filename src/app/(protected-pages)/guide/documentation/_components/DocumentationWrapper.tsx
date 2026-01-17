'use client'

import documentationRoutes from '../documentationRoutes'
import { usePathname } from 'next/navigation'
import { DocumentationRoute } from '@/@types/docs'
import type { ReactNode } from 'react'

type DocumentationWrapper = {
    children: ReactNode
    title: string
}

const getTitle = (
    routes: DocumentationRoute[],
    path: string,
): string | null => {
    for (const group of routes) {
        for (const navItem of group.nav) {
            if (navItem.path.toLowerCase() === path.toLowerCase()) {
                return navItem.label
            }
        }
    }
    return null // Return null if not found
}

const DocumentationWrapper = ({ children }: DocumentationWrapper) => {
    const pathname = usePathname()

    const title = getTitle(documentationRoutes, pathname)

    return (
        <div className="h-full w-full">
            <h3 className="mb-6">{title}</h3>
            <div className="prose dark:prose-invert max-w-[800px]">
                {children}
            </div>
        </div>
    )
}

export default DocumentationWrapper
