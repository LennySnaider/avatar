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
import { filterNavigation } from '@/lib/modules/navigation'
import { listInstalledSlugsForOrg } from '@/lib/modules/entitlements'
import { tryGetOrgContext } from '@/lib/tenant/getOrgContext'
import { isPlatformAdmin } from '@/lib/platform/platformDb'
import type { NavigationTree } from '@/@types/navigation'
import type { OrgRole } from '@/lib/org/permissions'

/**
 * Lo que la UI cliente necesita saber de la organización para PINTAR: los
 * módulos instalados y el rol del que mira.
 *
 * El rol viaja como HINT de pintado, nada más: quien autoriza vuelve a leer
 * `organization_members` en cada server action (`getOrgContext`), así que un
 * rol degradado a mitad de sesión no se puede explotar aunque este contexto
 * esté rancio. Y cuesta cero consultas extra: `tryGetOrgContext()` ya se
 * ejecutaba aquí y su `role` se descartaba.
 */
export interface OrgUiContext {
    role: OrgRole | null
    installedModules: string[]
    /**
     * F4.4 — Hint de pintado para el acceso a `/platform`. Como el rol, sólo
     * decide qué se ve: la página vuelve a comprobarlo con
     * `tryPlatformContext()` y cada acción con `requirePlatformAdmin()`.
     */
    isPlatformAdmin: boolean
}

export async function getOrgUiContext(): Promise<OrgUiContext> {
    const ctx = await tryGetOrgContext()
    if (!ctx) return { role: null, installedModules: [], isPlatformAdmin: false }
    const role = ctx.role as OrgRole

    // Se pregunta por el usuario REAL de la sesión, que es `ctx.userId` incluso
    // suplantando: el acceso al panel no se pierde por estar mirando un tenant,
    // que es justo cuando hace falta para poder salir.
    //
    // Guardado aparte de los módulos: son dos fallos distintos y mezclarlos en
    // un try haría que un module_catalog roto escondiera también el panel.
    let platformAdmin = false
    try {
        platformAdmin = await isPlatformAdmin(ctx.userId)
    } catch (e) {
        console.error('[navigation] isPlatformAdmin:', e)
    }

    try {
        return {
            role,
            installedModules: await listInstalledSlugsForOrg(ctx.organizationId),
            isPlatformAdmin: platformAdmin,
        }
    } catch (e) {
        // Un fallo leyendo módulos no puede dejar al usuario sin menú, pero sí
        // tiene que dejar rastro: sin loguear, un module_catalog roto se
        // degrada a "sin módulos instalados" sin una sola línea en los logs.
        console.error('[navigation] getOrgUiContext:', e)
        return { role, installedModules: [], isPlatformAdmin: platformAdmin }
    }
}

export async function getInstalledModules(): Promise<string[]> {
    return (await getOrgUiContext()).installedModules
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
export async function getNavigation(
    installed?: string[],
    role: OrgRole | null = null,
    isPlatformAdmin = false,
): Promise<NavigationTree[]> {
    const installedSlugs = installed ?? (await getInstalledModules())
    return filterNavigation(navigationConfig, {
        installedModules: installedSlugs,
        role,
        isPlatformAdmin,
    })
}
