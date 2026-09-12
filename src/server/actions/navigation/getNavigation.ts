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
    } catch (e) {
        // Un fallo leyendo módulos no puede dejar al usuario sin menú, pero sí
        // tiene que dejar rastro: sin loguear, un module_catalog roto se
        // degrada a "sin módulos instalados" sin una sola línea en los logs.
        console.error('[navigation] getInstalledModules:', e)
        return []
    }
}

/**
 * `installed` es opcional. Quien ya resolvió la lista de módulos (hoy sólo el
 * layout raíz, que la necesita también para `NavigationProvider`) se la pasa
 * aquí para no pagar dos veces la resolución de sesión + membresía que hace
 * `getInstalledModules` — antes esta función la recalculaba por su cuenta
 * aunque el llamador ya tuviera el dato, dos round-trips en serie por cada
 * navegación para podar un árbol que hoy no tiene nada que podar. Sin
 * argumento se comporta exactamente igual que antes, para cualquier otro
 * llamador.
 */
export async function getNavigation(installed?: string[]): Promise<NavigationTree[]> {
    const installedSlugs = installed ?? (await getInstalledModules())
    return filterNavigationByModules(navigationConfig, installedSlugs)
}
