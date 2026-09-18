'use server'

/**
 * Instalar y desinstalar módulos de la organización.
 *
 * Instalar NO asienta nada en el ledger: un módulo instalado sin bots
 * conectados no cuesta. La cuota la cobra el cron mensual contando unidades
 * reales, y la comisión se asienta al vender.
 *
 * Todos los exports son async porque el fichero es `'use server'`: un export
 * síncrono aquí sólo revienta en el build, ni tsc ni eslint lo ven.
 */
import { revalidatePath } from 'next/cache'
import { getOrgContext, type OrgContext } from '@/lib/tenant/getOrgContext'
import { orgTable, orgUpsert } from '@/lib/org/orgTable'
import { ctxCan } from '@/lib/org/guards'
import { getModuleCatalog, getModuleDefinition, type ModuleCatalogRow } from '@/lib/modules/catalog'
import { listOrgModules, type OrgModuleRow } from '@/lib/modules/entitlements'
import { getWalletBalance } from '@/lib/billing/wallet'

export interface ModulesResult<T> {
    success: boolean
    data?: T
    error?: string
}

/**
 * Sólo quien manda en la org toca la facturación.
 *
 * El reparto ya no se decide aquí: vive en la matriz de
 * `@/lib/org/permissions`, el único sitio donde está escrito qué puede cada
 * rol. Se conserva el NOMBRE `canManage` porque viaja en el DTO de
 * `listModules` hasta `ModulesClient`, que apaga sus botones con él.
 */
function canManage(ctx: OrgContext): boolean {
    return ctxCan(ctx, 'module:manage')
}

function fail(message: string): ModulesResult<never> {
    return { success: false, error: message }
}

/**
 * Igual que `fail`, pero para excepciones: además de traducirlas al contrato
 * de retorno, las deja escritas en el log del servidor.
 *
 * Existe separado de `fail` a propósito. `fail` también expresa rechazos
 * legítimos ("no eres administrador", "ese módulo no existe"), que son
 * respuestas normales y no deben ensuciar el log: si todo se registra como
 * error, nada destaca. Aquí sólo entra lo que de verdad se rompió.
 */
function failFromError(where: string, e: unknown): ModulesResult<never> {
    console.error(`[modules] ${where}:`, e)
    return fail(e instanceof Error ? e.message : String(e))
}

export async function listModules(): Promise<
    ModulesResult<{ catalog: ModuleCatalogRow[]; installed: OrgModuleRow[]; canManage: boolean }>
> {
    try {
        const ctx = await getOrgContext()
        const [catalog, installed] = await Promise.all([getModuleCatalog(), listOrgModules(ctx)])
        return { success: true, data: { catalog, installed, canManage: canManage(ctx) } }
    } catch (e) {
        return failFromError('listModules', e)
    }
}

async function setModuleStatus(
    slug: string,
    status: 'installed' | 'uninstalled',
): Promise<ModulesResult<OrgModuleRow>> {
    try {
        const ctx = await getOrgContext()
        if (!canManage(ctx)) {
            return fail('Sólo el propietario o un administrador pueden gestionar los módulos.')
        }

        const def = await getModuleDefinition(slug)
        if (!def || !def.isPublic) return fail(`El módulo "${slug}" no existe.`)

        const now = new Date().toISOString()
        const { error } = await orgUpsert(
            ctx,
            'org_modules',
            {
                module_slug: slug,
                status,
                // Reinstalar reabre la MISMA fila: el historial de cuándo se
                // instaló y se desinstaló no se pierde al borrar y recrear.
                // `installed_by` sólo se toca al instalar: es la auditoría de
                // quién instaló (ver migración), y escribirlo también al
                // desinstalar la pisaba con el usuario que se va, perdiendo el
                // dato desde la primera desinstalación.
                ...(status === 'installed'
                    ? { installed_at: now, uninstalled_at: null, installed_by: ctx.userId }
                    : { uninstalled_at: now }),
                updated_at: now,
            },
            { onConflict: 'organization_id,module_slug' },
        )
        if (error) {
            // Un fallo de escritura es del sistema, no del usuario: tiene que
            // dejar rastro. No pasa por `failFromError` porque un error de
            // PostgREST no es `instanceof Error` y su mensaje util se
            // perderia convertido en "[object Object]".
            console.error('[modules] setModuleStatus: fallo al guardar', error)
            return fail(error.message)
        }

        const { data, error: readError } = await orgTable(ctx, 'org_modules')
            .select('module_slug, status, installed_at, uninstalled_at, settings')
            .eq('module_slug', slug)
            .maybeSingle()
        if (readError) {
            console.error('[modules] setModuleStatus: fallo al releer', readError)
            return fail(readError.message)
        }

        // El árbol de navegación se calcula en el layout raíz: sin esto el menú
        // sigue mostrando (u ocultando) el módulo hasta la siguiente recarga dura.
        revalidatePath('/', 'layout')
        revalidatePath('/concepts/account/modules')

        const row = data as {
            module_slug: string
            status: string
            installed_at: string
            uninstalled_at: string | null
            settings: Record<string, unknown> | null
        } | null
        if (!row) {
            // Escribimos y la relectura no devolvio nada: es una anomalia, no
            // un rechazo esperado.
            console.error('[modules] setModuleStatus: guardado pero sin fila al releer', { slug, status })
            return fail('El módulo se guardó pero no se pudo releer.')
        }

        return {
            success: true,
            data: {
                moduleSlug: row.module_slug,
                status: row.status as OrgModuleRow['status'],
                installedAt: row.installed_at,
                uninstalledAt: row.uninstalled_at,
                settings: row.settings ?? {},
            },
        }
    } catch (e) {
        return failFromError('setModuleStatus', e)
    }
}

export async function installModule(slug: string): Promise<ModulesResult<OrgModuleRow>> {
    return setModuleStatus(slug, 'installed')
}

export async function uninstallModule(slug: string): Promise<ModulesResult<OrgModuleRow>> {
    return setModuleStatus(slug, 'uninstalled')
}

/** Saldo + módulos instalados, para Settings → Billing (que es cliente y no puede leer el server directo). */
export async function getBillingOverview(): Promise<
    ModulesResult<{ balance: Awaited<ReturnType<typeof getWalletBalance>>; installed: OrgModuleRow[] }>
> {
    try {
        const ctx = await getOrgContext()
        // El saldo es informacion de negocio: un operador gasta tokens, pero no
        // tiene por que ver cuanto queda ni que se ha cobrado este mes.
        if (!ctxCan(ctx, 'billing:manage')) {
            return fail('Sólo el propietario o un administrador pueden ver la facturación.')
        }
        const [balance, installed] = await Promise.all([getWalletBalance(ctx), listOrgModules(ctx)])
        return { success: true, data: { balance, installed } }
    } catch (e) {
        return failFromError('getBillingOverview', e)
    }
}
