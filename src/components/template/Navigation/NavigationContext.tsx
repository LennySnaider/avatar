'use client'

import { createContext, useContext } from 'react'
import type { NavigationTree } from '@/@types/navigation'

type Navigation = {
    navigationTree: NavigationTree[]
    installedModules: string[]
}

const NavigationContext = createContext<Navigation>({
    navigationTree: [],
    installedModules: [],
})

/** Slugs de módulo instalados por la organización actual (o `[]` sin sesión). */
export function useInstalledModules(): string[] {
    return useContext(NavigationContext)?.installedModules ?? []
}

export default NavigationContext
