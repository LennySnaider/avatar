'use client'

/**
 * Oculta su contenido si la organización no tiene el módulo instalado.
 * Análogo a `AuthorityCheck`, y con el mismo alcance: es cosmético. Lo que
 * autoriza de verdad es `requireModule` dentro de la server action.
 */
import type { ReactNode } from 'react'
import { useInstalledModules } from '@/components/template/Navigation/NavigationContext'

interface ModuleCheckProps {
    module: string
    children: ReactNode
    fallback?: ReactNode
}

export default function ModuleCheck({ module, children, fallback = null }: ModuleCheckProps) {
    const installed = useInstalledModules()
    return <>{installed.includes(module) ? children : fallback}</>
}
