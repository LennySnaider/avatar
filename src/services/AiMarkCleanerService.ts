'use server'

/**
 * Acciones del módulo `ai-mark-cleaner` (limpieza de marcas de IA).
 *
 * Todos los exports son `async`: en un fichero `'use server'` un export
 * síncrono compila con tsc y con eslint, y revienta en el build. Ver la nota
 * del proyecto sobre `use-server-exports-async`.
 */
import {
    aplicarParche,
    leerAjustes,
    type AiMarkCleanerSettings,
} from '@/lib/aiMarks/settings'
import { MODULO_AI_MARKS } from '@/lib/aiMarks/types'
import { getModuleBillingSummary } from '@/lib/billing/moduleSummary'
import { ctxCan } from '@/lib/org/guards'
import { orgTable } from '@/lib/org/orgTable'
import { getOrgContext, type OrgContext } from '@/lib/tenant/getOrgContext'

export interface AiMarkCleanerStatus {
    instalado: boolean
    ajustes: AiMarkCleanerSettings
    /** Consumo del mes en curso, para que el tenant vea lo que lleva gastado. */
    usoDelMes: { archivos: number; tokens: number }
}

type Resultado<T> = { success: true; data: T } | { success: false; error: string }

function fallo(donde: string, e: unknown): { success: false; error: string } {
    // Se registra SIEMPRE. Un `catch` mudo convierte un fallo de base de datos
    // en un "no está instalado" que nadie puede diagnosticar.
    const mensaje = e instanceof Error ? e.message : String(e)
    console.error(`[aiMarkCleaner] ${donde}:`, mensaje)
    return { success: false, error: mensaje }
}

/** Lee la fila del módulo. `null` = no instalado en esta organización. */
async function leerFilaModulo(ctx: OrgContext): Promise<{ settings: unknown } | null> {
    const { data, error } = await orgTable(ctx, 'org_modules')
        .select('settings')
        .eq('module_slug', MODULO_AI_MARKS)
        .eq('status', 'installed')
        .maybeSingle()
    if (error) throw new Error(error.message)
    return (data as { settings: unknown } | null) ?? null
}

/**
 * Archivos limpiados y tokens cobrados este mes.
 *
 * Va por `getModuleBillingSummary` y no por una consulta propia: `token_ledger`
 * NO es tabla de tenant (no la declara `orgTable`) y ese helper ya resuelve el
 * período, el aviso de truncamiento de PostgREST y el signo de los asientos.
 */
async function leerUsoDelMes(
    organizationId: string,
): Promise<{ archivos: number; tokens: number }> {
    const resumen = await getModuleBillingSummary(organizationId, MODULO_AI_MARKS)
    return { archivos: resumen.usageCount, tokens: resumen.usageTokens }
}

/** Estado del módulo para el cajón de ajustes. */
export async function getAiMarkCleanerStatus(): Promise<Resultado<AiMarkCleanerStatus>> {
    try {
        const ctx = await getOrgContext()
        if (!ctxCan(ctx, 'module:manage')) {
            return { success: false, error: 'Sin permiso para gestionar módulos.' }
        }
        const fila = await leerFilaModulo(ctx)
        if (!fila) {
            return {
                success: true,
                data: {
                    instalado: false,
                    ajustes: leerAjustes(null),
                    usoDelMes: { archivos: 0, tokens: 0 },
                },
            }
        }
        return {
            success: true,
            data: {
                instalado: true,
                ajustes: leerAjustes(fila.settings),
                usoDelMes: await leerUsoDelMes(ctx.organizationId),
            },
        }
    } catch (e) {
        return fallo('getAiMarkCleanerStatus', e)
    }
}

/**
 * Guarda un cambio parcial de los ajustes.
 *
 * Lee-modifica-escribe sobre el JSON existente en vez de sobrescribirlo: la
 * columna `settings` es compartida y un cliente antiguo que no conozca un campo
 * no debe borrarlo al guardar otro.
 */
export async function updateAiMarkCleanerSettings(
    parche: Partial<AiMarkCleanerSettings>,
): Promise<Resultado<AiMarkCleanerSettings>> {
    try {
        const ctx = await getOrgContext()
        if (!ctxCan(ctx, 'module:manage')) {
            return { success: false, error: 'Sin permiso para gestionar módulos.' }
        }
        const fila = await leerFilaModulo(ctx)
        if (!fila) return { success: false, error: 'El módulo no está instalado.' }

        const actuales = leerAjustes(fila.settings)
        const nuevos = aplicarParche(actuales, parche)
        const crudos =
            fila.settings && typeof fila.settings === 'object' && !Array.isArray(fila.settings)
                ? (fila.settings as Record<string, unknown>)
                : {}
        const { error } = await orgTable(ctx, 'org_modules')
            .update({ settings: { ...crudos, ...nuevos } } as never)
            .eq('module_slug', MODULO_AI_MARKS)
        if (error) throw new Error(error.message)
        return { success: true, data: nuevos }
    } catch (e) {
        return fallo('updateAiMarkCleanerSettings', e)
    }
}
