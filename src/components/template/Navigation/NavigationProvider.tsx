'use client'

import NavigationContext from './NavigationContext'

import type { NavigationTree } from '@/@types/navigation'
import type { CommonProps } from '@/@types/common'

interface NavigationProviderProps extends CommonProps {
    navigationTree: NavigationTree[]
    installedModules: string[]
}

const NavigationProvider = ({
    navigationTree,
    installedModules,
    children,
}: NavigationProviderProps) => {
    return (
        <NavigationContext.Provider value={{ navigationTree, installedModules }}>
            {children}
        </NavigationContext.Provider>
    )
}

export default NavigationProvider
