'use client'

import NavigationContext from './NavigationContext'

import type { NavigationTree } from '@/@types/navigation'
import type { CommonProps } from '@/@types/common'
import type { OrgRole } from '@/lib/org/permissions'

interface NavigationProviderProps extends CommonProps {
    navigationTree: NavigationTree[]
    installedModules: string[]
    /** Opcional para no romper a otros llamadores; el layout raíz siempre lo pasa. */
    role?: OrgRole | null
}

const NavigationProvider = ({
    navigationTree,
    installedModules,
    role = null,
    children,
}: NavigationProviderProps) => {
    return (
        <NavigationContext.Provider
            value={{ navigationTree, installedModules, role }}
        >
            {children}
        </NavigationContext.Provider>
    )
}

export default NavigationProvider
