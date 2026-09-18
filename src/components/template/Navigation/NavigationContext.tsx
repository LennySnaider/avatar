'use client'

import { createContext, useContext } from 'react'
import type { NavigationTree } from '@/@types/navigation'
import { can, type OrgRole, type Permission } from '@/lib/org/permissions'

type Navigation = {
    navigationTree: NavigationTree[]
    installedModules: string[]
    /** Rol del que mira, o null sin sesión. HINT de pintado, no autorización. */
    role: OrgRole | null
}

const NavigationContext = createContext<Navigation>({
    navigationTree: [],
    installedModules: [],
    role: null,
})

/** Slugs de módulo instalados por la organización actual (o `[]` sin sesión). */
export function useInstalledModules(): string[] {
    return useContext(NavigationContext)?.installedModules ?? []
}

/**
 * Rol del usuario en su organización, para decidir qué se PINTA.
 *
 * Lo que autoriza de verdad es `requirePermission` dentro de cada server
 * action, que re-consulta la membresía: este valor sólo sirve para no enseñar
 * botones que van a fallar. Sin sesión (o sin rol resuelto) es `null`, y
 * `usePermission` entonces devuelve `false` — FALLA CERRADO, al contrario que
 * `useAuthority`, que con listas vacías devuelve `true`.
 */
export function useOrgRole(): OrgRole | null {
    return useContext(NavigationContext)?.role ?? null
}

export function usePermission(permission: Permission): boolean {
    return can(useOrgRole(), permission)
}

export default NavigationContext
