'use client'

import { useEffect, useState, type ReactNode } from 'react'

interface ClientOnlyProps {
    children: ReactNode
    fallback?: ReactNode
}

/**
 * Wrapper component that only renders children on the client side.
 * Useful for components that use dynamic IDs (like FloatingUI/Dropdown)
 * which cause hydration mismatches between server and client.
 */
const ClientOnly = ({ children, fallback = null }: ClientOnlyProps) => {
    const [hasMounted, setHasMounted] = useState(false)

    useEffect(() => {
        setHasMounted(true)
    }, [])

    if (!hasMounted) {
        return fallback
    }

    return <>{children}</>
}

export default ClientOnly
