import DocumentationNav from '@/components/docs/DocumentationNav'
import DocumentationWrapper from './_components/DocumentationWrapper'
import documentationRoutes from './documentationRoutes'
import type { ReactNode } from 'react'

const Layout = ({ children }: { children: ReactNode }) => {
    return (
        <div className="lg:flex h-full gap-8">
            <div className="lg:w-[280px] py-2 lg-py-0 px-4 mb-4 border border-gray-200 dark:border-gray-700 rounded-md lg:border-0">
                <DocumentationNav routes={documentationRoutes} />
            </div>
            <div className="w-full">
                <DocumentationWrapper title="Getting Started">
                    {children}
                </DocumentationWrapper>
            </div>
        </div>
    )
}

export default Layout
