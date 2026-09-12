/**
 * Catálogo GLOBAL de módulos: precios y comisiones. No es una tabla tenant
 * (no lleva organization_id), así que no pasa por `orgTable` — es el mismo
 * caso que `ai_providers`.
 *
 * Se lee siempre de la base de datos y no se hardcodea: el precio y las
 * comisiones son editables por SQL sin desplegar.
 */
import { orgSupabase } from '@/lib/org/orgTable'

export type ModuleUnit = 'bot' | 'avatar' | 'org'

export interface ModuleCatalogRow {
    slug: string
    name: string
    description: string | null
    priceUsdMonthPerUnit: number
    unit: ModuleUnit
    commissionAiPct: number
    commissionManualPct: number
    isPublic: boolean
    sortOrder: number
}

interface RawModuleCatalogRow {
    slug: string
    name: string
    description: string | null
    price_usd_month_per_unit: number | string
    unit: string
    commission_ai_pct: number | string
    commission_manual_pct: number | string
    is_public: boolean
    sort_order: number
}

/** numeric de Postgres llega como string en supabase-js según el driver. */
function num(value: number | string | null): number {
    return typeof value === 'number' ? value : Number(value ?? 0)
}

function toRow(raw: RawModuleCatalogRow): ModuleCatalogRow {
    return {
        slug: raw.slug,
        name: raw.name,
        description: raw.description,
        priceUsdMonthPerUnit: num(raw.price_usd_month_per_unit),
        unit: raw.unit as ModuleUnit,
        commissionAiPct: num(raw.commission_ai_pct),
        commissionManualPct: num(raw.commission_manual_pct),
        isPublic: raw.is_public,
        sortOrder: raw.sort_order,
    }
}

/** Módulos ofrecibles, ordenados para la página de marketplace. */
export async function getModuleCatalog(): Promise<ModuleCatalogRow[]> {
    const { data, error } = await orgSupabase()
        .from('module_catalog')
        .select('*')
        .eq('is_public', true)
        .order('sort_order', { ascending: true })
    if (error) throw new Error(error.message)
    return ((data ?? []) as unknown as RawModuleCatalogRow[]).map(toRow)
}

/** Un módulo por slug, público o no (el cobro lee módulos ya instalados). */
export async function getModuleDefinition(slug: string): Promise<ModuleCatalogRow | null> {
    const { data, error } = await orgSupabase()
        .from('module_catalog')
        .select('*')
        .eq('slug', slug)
        .maybeSingle()
    if (error) throw new Error(error.message)
    return data ? toRow(data as unknown as RawModuleCatalogRow) : null
}
