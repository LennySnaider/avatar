/**
 * Cuota mensual de cada módulo instalado, cobrada por unidades reales y
 * prorrateada por días naturales.
 *
 * Se cobra POR VENCIDO: para saber cuántos días estuvo activa una unidad hay
 * que esperar a que el mes termine, así que por defecto se liquida el mes
 * ANTERIOR (`previousPeriodUtc`), nunca el mes en curso — un bot conectado
 * el 28 de septiembre paga sólo esos 3 días de septiembre, no el mes entero
 * ni "empieza a pagar en octubre".
 *
 * Idempotente por (organización, módulo, mes): el asiento usa
 * `idempotencyKey = module_fee:${slug}:${period}`, así que aunque el cron
 * corra a diario, sólo el primer pase que encuentra actividad en el periodo
 * asienta el cargo — los pases siguientes son no-op (`chargeTokens` los
 * detecta y los cuenta como `replayed`). Correr a diario no es el prorrateo:
 * es tolerancia a que el pase del día 1 del mes falle.
 *
 * La aritmética de fechas (`periodBounds`, `unitDaysInPeriod`,
 * `previousPeriodUtc`, `currentPeriodUtc`, `UnitActivity`) vive en
 * `./period`, un módulo puro sin cliente de datos — aquí se importa y se
 * re-exporta para no romper a quien ya la pedía de este fichero.
 *
 * Recorre TODAS las organizaciones a propósito (es un cron sin sesión) y
 * resuelve la org fila a fila.
 */
import { orgSupabase } from '@/lib/org/orgTable'
import { chargeTokens } from './wallet'
import { MODULE_SKU, usdToTokens } from './catalog'
import { currentPeriodUtc, previousPeriodUtc, periodBounds, unitDaysInPeriod } from './period'
import type { UnitActivity } from './period'

export { currentPeriodUtc, previousPeriodUtc, unitDaysInPeriod }
export type { UnitActivity }

const UNIT_ACTIVITY = new Map<string, (organizationId: string) => Promise<UnitActivity[]>>()

export function registerUnitActivity(
    slug: string,
    fn: (organizationId: string) => Promise<UnitActivity[]>,
): void {
    UNIT_ACTIVITY.set(slug, fn)
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

export async function chargeModuleFees(period = previousPeriodUtc()): Promise<ModuleFeesResult> {
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
        if (price <= 0) {
            // Caso legítimo: módulo gratis (o aún sin precio fijado). No
            // merece aviso — es la configuración, no un agujero.
            result.skipped++
            continue
        }

        const report = UNIT_ACTIVITY.get(raw.module_slug)
        if (!report) {
            // Éste SÍ es el camino mudo que preocupa: un módulo instalado con
            // precio > 0 pero sin quien informe su actividad se salta en
            // silencio y podría seguir así para siempre — el cron corre a
            // diario y nada distingue "hoy no tocaba" de "esto nunca cobra".
            console.warn(
                `[module-fees] módulo "${raw.module_slug}" (org ${raw.organization_id}) tiene precio > 0 pero nadie informa su actividad — no se está cobrando su cuota.`,
            )
            result.skipped++
            continue
        }

        try {
            const activity = await report(raw.organization_id)
            const { days: daysInPeriod } = periodBounds(period)
            const unitDays = activity.reduce((acc, a) => acc + unitDaysInPeriod(a, period), 0)
            if (unitDays <= 0) {
                result.skipped++
                continue
            }
            const usd = price * (unitDays / daysInPeriod)
            const tokens = usdToTokens(usd)
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
                    units: activity.length,
                    unit_days: unitDays,
                    days_in_period: daysInPeriod,
                    price_per_unit: price,
                    prorated: true,
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
