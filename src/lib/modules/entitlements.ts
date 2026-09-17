/**
 * "¿Tiene esta organización el módulo X?" — la única respuesta autorizada.
 *
 * Dos familias a propósito:
 *  - `hasModule` / `requireModule` / `listOrgModules` piden `ctx`: son las que
 *    usan las server actions, donde hay sesión.
 *  - `hasModuleForOrg` / `listInstalledSlugsForOrg` reciben la org ya resuelta:
 *    son para cron y webhooks. NO usan `getOrgContextForUser`, que devuelve la
 *    PRIMERA membresía del usuario y no la org de la fila — el mismo bug que
 *    documenta `resolveTargetAvatar` en el inbox del agente.
 */
import { cache } from 'react'
import { orgSupabase, orgTable } from '@/lib/org/orgTable'
import type { OrgContext } from '@/lib/tenant/getOrgContext'

export type ModuleSlug = 'telegram'

export type OrgModuleStatus = 'installed' | 'suspended' | 'uninstalled'

export interface OrgModuleRow {
    moduleSlug: string
    status: OrgModuleStatus
    installedAt: string
    uninstalledAt: string | null
    settings: Record<string, unknown>
}

interface RawOrgModuleRow {
    module_slug: string
    status: string
    installed_at: string
    uninstalled_at: string | null
    settings: Record<string, unknown> | null
}

function toRow(raw: RawOrgModuleRow): OrgModuleRow {
    return {
        moduleSlug: raw.module_slug,
        status: raw.status as OrgModuleStatus,
        installedAt: raw.installed_at,
        uninstalledAt: raw.uninstalled_at,
        settings: raw.settings ?? {},
    }
}

/** Error con mensaje presentable: las server actions lo devuelven tal cual. */
export class ModuleNotInstalledError extends Error {
    readonly code = 'MODULE_NOT_INSTALLED'
    constructor(readonly slug: string) {
        super(
            `El módulo "${slug}" no está instalado en tu organización. Instálalo desde Cuenta → Módulos.`,
        )
        this.name = 'ModuleNotInstalledError'
    }
}

/** Todas las filas de módulo de la org, instaladas o no (para el marketplace). */
export async function listOrgModules(ctx: OrgContext): Promise<OrgModuleRow[]> {
    const { data, error } = await orgTable(ctx, 'org_modules').select(
        'module_slug, status, installed_at, uninstalled_at, settings',
    )
    if (error) throw new Error(error.message)
    return ((data ?? []) as RawOrgModuleRow[]).map(toRow)
}

export async function hasModule(ctx: OrgContext, slug: ModuleSlug | string): Promise<boolean> {
    const slugs = await listInstalledSlugsForOrg(ctx.organizationId)
    return slugs.includes(slug)
}

/** Lanza si el módulo no está instalado. El punto de entrada de cada action. */
export async function requireModule(ctx: OrgContext, slug: ModuleSlug | string): Promise<void> {
    if (!(await hasModule(ctx, slug))) throw new ModuleNotInstalledError(slug)
}

/**
 * Slugs instalados de una org. Cacheado por request con `React.cache`: en un
 * render lo consultan el layout raíz (para el menú), el layout del módulo (para
 * el gate) y la propia página — con la caché es una sola consulta.
 */
export const listInstalledSlugsForOrg = cache(
    async (organizationId: string): Promise<string[]> => {
        const { data, error } = await orgSupabase()
            .from('org_modules')
            .select('module_slug')
            .eq('organization_id', organizationId)
            .eq('status', 'installed')
        if (error) throw new Error(error.message)
        return ((data ?? []) as { module_slug: string }[]).map((r) => r.module_slug)
    },
)

/** Variante sin sesión para cron/webhooks: la org llega ya resuelta. */
export async function hasModuleForOrg(
    organizationId: string,
    slug: ModuleSlug | string,
): Promise<boolean> {
    const slugs = await listInstalledSlugsForOrg(organizationId)
    return slugs.includes(slug)
}
