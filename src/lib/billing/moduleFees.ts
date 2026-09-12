/**
 * Cuota mensual de cada módulo instalado, cobrada por unidades reales.
 *
 * Idempotente por (organización, módulo, mes): el cron corre a diario y sólo
 * el primer pase del mes con unidades activas cobra. Correr a diario es
 * tolerancia a fallos del día 1, no prorrateo — un bot conectado a mitad de
 * mes empieza a pagar el mes siguiente.
 *
 * Recorre TODAS las organizaciones a propósito (es un cron sin sesión) y
 * resuelve la org fila a fila.
 */
import { orgSupabase } from '@/lib/org/orgTable'
import { chargeTokens } from './wallet'
import { MODULE_SKU, usdToTokens } from './catalog'

/**
 * Quién sabe contar las unidades de cada módulo. El contador de Telegram lo
 * registra el propio módulo de Telegram al cargarse; mientras no exista,
 * el cron simplemente no cobra ese módulo en vez de fallar.
 */
const UNIT_COUNTERS = new Map<string, (organizationId: string) => Promise<number>>()

export function registerUnitCounter(
    slug: string,
    fn: (organizationId: string) => Promise<number>,
): void {
    UNIT_COUNTERS.set(slug, fn)
}

/** 'YYYY-MM' en UTC. */
export function currentPeriodUtc(): string {
    return new Date().toISOString().slice(0, 7)
}

export interface ModuleFeesResult {
    period: string
    charged: number
    replayed: number
    skipped: number
    failed: number
    tokens: number
}

interface InstalledModuleRow {
    organization_id: string
    module_slug: string
    module_catalog: {
        price_usd_month_per_unit: number | string
        unit: string
    } | null
}

export async function chargeModuleFees(period = currentPeriodUtc()): Promise<ModuleFeesResult> {
    const result: ModuleFeesResult = {
        period,
        charged: 0,
        replayed: 0,
        skipped: 0,
        failed: 0,
        tokens: 0,
    }

    const { data, error } = await orgSupabase()
        .from('org_modules')
        .select('organization_id, module_slug, module_catalog(price_usd_month_per_unit, unit)')
        .eq('status', 'installed')
    if (error) throw new Error(error.message)

    for (const raw of (data ?? []) as unknown as InstalledModuleRow[]) {
        const def = raw.module_catalog
        if (!def) {
            result.skipped++
            continue
        }
        const price = Number(def.price_usd_month_per_unit ?? 0)
        const counter = UNIT_COUNTERS.get(raw.module_slug)
        if (price <= 0 || !counter) {
            result.skipped++
            continue
        }

        try {
            const units = await counter(raw.organization_id)
            if (units <= 0) {
                result.skipped++
                continue
            }
            const tokens = usdToTokens(price * units)
            if (tokens <= 0) {
                result.skipped++
                continue
            }

            const refId = `${raw.module_slug}:${period}`
            const res = await chargeTokens({
                organizationId: raw.organization_id,
                tokens,
                sku: MODULE_SKU.fee(raw.module_slug),
                refType: 'module_fee',
                refId,
                idempotencyKey: `module_fee:${refId}`,
                metadata: {
                    period,
                    unit: def.unit,
                    units,
                    price_per_unit: price,
                },
            })

            if (!res.ok) {
                result.failed++
                console.error(`[module-fees] ${raw.module_slug} org ${raw.organization_id}:`, res.reason)
                continue
            }
            if (res.replayed) {
                result.replayed++
            } else {
                result.charged++
                result.tokens += tokens
            }
        } catch (e) {
            // Una org que falla no puede impedir que se cobren las demás.
            result.failed++
            console.error(`[module-fees] ${raw.module_slug} org ${raw.organization_id}:`, e)
        }
    }

    return result
}
