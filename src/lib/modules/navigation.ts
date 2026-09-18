/**
 * Poda del árbol de navegación por módulos instalados Y por rol. Función PURA:
 * la decisión de qué está instalado y quién mira la toma `getNavigation` en
 * servidor y aquí sólo se aplica, que es lo que la hace testeable sin base.
 *
 * Esto sólo OCULTA. El gate real de acceso está en el layout de la ruta y en
 * cada server action (`requireModule`, `requirePermission`): un menú escondido
 * no autoriza nada.
 *
 * UN SOLO `walk` para los dos criterios a propósito: dos pasadas independientes
 * colapsarían los grupos vacíos dos veces (mismo resultado, doble recorrido) y
 * repartirían la regla "un collapse sin hijos desaparece" en dos sitios.
 */
import type { NavigationTree } from '@/@types/navigation'
import { can, type OrgRole } from '@/lib/org/permissions'

export interface NavigationFilter {
    installedModules: string[]
    /** null sin sesión o sin membresía: los ítems con permiso se ocultan (falla cerrado). */
    role: OrgRole | null
}

export function filterNavigation(
    tree: NavigationTree[],
    filter: NavigationFilter,
): NavigationTree[] {
    const installed = new Set(filter.installedModules)

    const walk = (nodes: NavigationTree[]): NavigationTree[] => {
        const out: NavigationTree[] = []
        for (const node of nodes) {
            const required = node.meta?.requiredModule
            if (required && !installed.has(required)) continue

            const permission = node.meta?.requiredPermission
            if (permission && !can(filter.role, permission)) continue

            const subMenu = node.subMenu?.length ? walk(node.subMenu) : []

            // Un grupo que se queda sin hijos deja un desplegable vacío que no
            // lleva a ninguna parte; un ítem hoja nunca tuvo hijos y se queda.
            if (node.subMenu?.length && subMenu.length === 0) continue

            out.push({ ...node, subMenu })
        }
        return out
    }

    return walk(tree)
}
