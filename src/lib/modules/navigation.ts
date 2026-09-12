/**
 * Poda del árbol de navegación por módulos instalados. Función PURA: la
 * decisión de qué está instalado la toma `getNavigation` en servidor y aquí
 * sólo se aplica, que es lo que la hace testeable sin base de datos.
 *
 * Esto sólo OCULTA. El gate real de acceso está en el layout de la ruta y en
 * cada server action (`requireModule`): un menú escondido no autoriza nada.
 */
import type { NavigationTree } from '@/@types/navigation'

export function filterNavigationByModules(
    tree: NavigationTree[],
    installedSlugs: string[],
): NavigationTree[] {
    const installed = new Set(installedSlugs)

    const walk = (nodes: NavigationTree[]): NavigationTree[] => {
        const out: NavigationTree[] = []
        for (const node of nodes) {
            const required = node.meta?.requiredModule
            if (required && !installed.has(required)) continue

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
