import Container from '@/components/shared/Container'
import type { ReactNode } from 'react'

const Layout = ({ children }: { children: ReactNode }) => {
    return (
        <Container className="h-full">
            <div className="lg:flex justify-center gap-4 h-full">
                {children}
            </div>
        </Container>
    )
}

export default Layout
