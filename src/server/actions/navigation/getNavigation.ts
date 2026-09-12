/**
 * Árbol de navegación ya podado por los módulos que la organización tiene
 * instalados.
 *
 * `tryGetOrgContext` y no `getOrgContext` porque el layout raíz también
 * renderiza páginas sin sesión: sin contexto no hay módulos y se cae al árbol
 * base, que es lo correcto (los ítems de módulo llevan `requiredModule` y
 * desaparecen solos).
 *
 * Esto sólo decide qué se PINTA. Autorizar es cosa del layout de cada módulo y
 * de `requireModule` en las server actions.
 */
import navigationConfig from '@/configs/navigation.config'
import { filterNavigationByModules } from '@/lib/modules/navigation'
import { listInstalledSlugsForOrg } from '@/lib/modules/entitlements'
import { tryGetOrgContext } from '@/lib/tenant/getOrgContext'
import type { NavigationTree } from '@/@types/navigation'

export async function getInstalledModules(): Promise<string[]> {
    const ctx = await tryGetOrgContext()
    if (!ctx) return []
    try {
        return await listInstalledSlugsForOrg(ctx.organizationId)
    } catch {
        // Un fallo leyendo módulos no puede dejar al usuario sin menú.
        return []
    }
}

export async function getNavigation(): Promise<NavigationTree[]> {
    const installed = await getInstalledModules()
    return filterNavigationByModules(navigationConfig, installed)
}
