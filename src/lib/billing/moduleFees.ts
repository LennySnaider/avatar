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
 * Recorre TODAS las organizaciones a propósito (es un cron sin sesión) y
 * resuelve la org fila a fila.
 */
import { orgSupabase } from '@/lib/org/orgTable'
import { chargeTokens } from './wallet'
import { MODULE_SKU, usdToTokens } from './catalog'

/**
 * Cuándo estuvo facturable una unidad. Lo informa el módulo dueño del dato
 * (el canal de Telegram sabe cuándo se conectó cada bot); la aritmética del
 * prorrateo vive aquí, en facturación.
 */
export interface UnitActivity {
    /** ISO de cuándo la unidad pasó a ser facturable. */
    activeFrom: string
    /** ISO de cuándo dejó de serlo, o null si sigue activa. */
    activeUntil: string | null
}

const UNIT_ACTIVITY = new Map<string, (organizationId: string) => Promise<UnitActivity[]>>()

export function registerUnitActivity(
    slug: string,
    fn: (organizationId: string) => Promise<UnitActivity[]>,
): void {
    UNIT_ACTIVITY.set(slug, fn)
}

/** 'YYYY-MM' en UTC. */
export function currentPeriodUtc(): string {
    return new Date().toISOString().slice(0, 7)
}

/** 'YYYY-MM' del mes ANTERIOR en UTC. Es el que se cobra: el prorrateo sólo
 *  se puede calcular sobre un mes ya cerrado. */
export function previousPeriodUtc(): string {
    const now = new Date()
    const year = now.getUTCFullYear()
    // getUTCMonth es 0-based, así que su valor YA es el mes anterior en 1-based.
    const month = now.getUTCMonth()
    return month === 0 ? `${year - 1}-12` : `${year}-${String(month).padStart(2, '0')}`
}

const DAY_MS = 86_400_000

/** Límites [inicio, fin) del mes en UTC, y cuántos días tiene. */
function periodBounds(period: string): { start: number; end: number; days: number } {
    const [year, month] = period.split('-').map(Number)
    const start = Date.UTC(year, month - 1, 1)
    // Diciembre → enero del año siguiente.
    const end = month === 12 ? Date.UTC(year + 1, 0, 1) : Date.UTC(year, month, 1)
    return { start, end, days: Math.round((end - start) / DAY_MS) }
}

/**
 * Días NATURALES que una unidad estuvo activa dentro del periodo.
 *
 * Se cuentan días tocados, no horas: conectarse a las 23:50 cuenta ese día
 * entero. Es la convención más fácil de explicar en una factura, y evita que
 * un cobro dependa de la hora del reloj.
 */
export function unitDaysInPeriod(activity: UnitActivity, period: string): number {
    const { start, end, days } = periodBounds(period)
    const from = Date.parse(activity.activeFrom)
    if (!Number.isFinite(from)) return 0
    const rawUntil = activity.activeUntil ? Date.parse(activity.activeUntil) : end
    const until = Number.isFinite(rawUntil) ? rawUntil : end

    const overlapStart = Math.max(from, start)
    const overlapEnd = Math.min(until, end)
    if (overlapEnd <= overlapStart) return 0

    const firstDay = Math.floor(overlapStart / DAY_MS)
    const lastDay = Math.ceil(overlapEnd / DAY_MS)
    return Math.min(lastDay - firstDay, days)
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
