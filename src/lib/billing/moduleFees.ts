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
 * re-exporta para no romper a quien ya la pedía de este fichero. `period.ts`
 * es puro y por eso NUNCA avisa de nada; si una organización manda entradas
 * de actividad rotas (fechas ilegibles o invertidas), avisarlo con contexto
 * de organización y módulo es responsabilidad de este fichero, no de aquél.
 *
 * `periodBounds(period)` se resuelve una sola vez, antes del bucle: si
 * alguna vez `period` llega roto desde fuera (hoy sólo lo generan
 * `previousPeriodUtc`/`currentPeriodUtc`, pero esto ya es una función
 * exportada sin más guardas), falla una vez y de forma clara en vez de
 * fallar org por org dentro del `catch`.
 *
 * Recorre TODAS las organizaciones a propósito (es un cron sin sesión) y
 * resuelve la org fila a fila.
 */
import { orgSupabase } from '@/lib/org/orgTable'
import { chargeTokens } from './wallet'
import { MODULE_SKU, usdToTokens } from './catalog'
import { currentPeriodUtc, previousPeriodUtc, periodBounds, unitDaysInPeriod, isUnitActivityValid } from './period'
import { isBillingExempt } from './exemption'
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
    /**
     * Organizaciones donde TODA la actividad reportada del módulo era
     * inválida (fechas ilegibles o invertidas) — no "sin actividad este
     * mes" (eso es `skipped`, y es normal), sino "lo que llegó está roto".
     * Se cuenta aparte para que no se confunda un canal con datos corruptos
     * con uno que simplemente está tranquilo.
     */
    invalidActivity: number
    /**
     * Organizaciones exentas de cobro (`organizations.billing_exempt`): no
     * se llamó a `chargeTokens`, así que no se asentó nada en el ledger — ver
     * `src/lib/billing/exemption.ts` para el porqué. Se cuenta aparte para
     * poder ver cuánta cuota se dejó de cobrar sin que se confunda con un
     * fallo (`failed`) ni con "sin actividad este mes" (`skipped`).
     */
    exempt: number
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
    // Falla aquí, una vez, si `period` no es "YYYY-MM" válido — antes de
    // tocar la base de datos y antes de que un periodo roto se disfrace de
    // "fallo" en cada organización dentro del bucle.
    const { days: daysInPeriod } = periodBounds(period)

    const result: ModuleFeesResult = {
        period,
        charged: 0,
        replayed: 0,
        skipped: 0,
        invalidActivity: 0,
        exempt: 0,
        failed: 0,
        tokens: 0,
    }

    const { data, error } = await orgSupabase()
        .from('org_modules')
        .select('organization_id, module_slug, module_catalog(price_usd_month_per_unit, unit)')
        .eq('status', 'installed')
    if (error) throw new Error(error.message)

    for (const raw of (data ?? []) as unknown as InstalledModuleRow[]) {
        // Antes de calcular nada: una organización exenta no genera NINGÚN
        // asiento (ver `src/lib/billing/exemption.ts`), así que ni siquiera
        // vale la pena resolver el catálogo del módulo o pedir su actividad.
        // Try/catch propio: que falle ESTA comprobación no puede tumbar el
        // pase entero — misma razón que el try/catch de más abajo.
        try {
            if (await isBillingExempt(raw.organization_id)) {
                result.exempt++
                console.log(
                    `[module-fees] módulo "${raw.module_slug}" (org ${raw.organization_id}): organización exenta de cobro — no se asienta cuota.`,
                )
                continue
            }
        } catch (e) {
            result.failed++
            console.error(`[module-fees] ${raw.module_slug} org ${raw.organization_id}: comprobando exención`, e)
            continue
        }

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
            const validActivity = activity.filter(isUnitActivityValid)
            const discardedUnits = activity.length - validActivity.length

            if (discardedUnits > 0) {
                // Dato roto, no ausente: activeFrom/activeUntil ilegibles, o
                // un fin que no es posterior a su propio inicio. Se descarta
                // (nunca se adivina, ni de más ni de menos), pero queda
                // registrado porque el origen del dato tiene un bug real.
                console.warn(
                    `[module-fees] módulo "${raw.module_slug}" (org ${raw.organization_id}): ${discardedUnits} de ${activity.length} entrada(s) de actividad inválida(s) — descartadas del prorrateo.`,
                )
            }

            if (activity.length > 0 && validActivity.length === 0) {
                // Ninguna entrada es utilizable: no es "sin actividad este
                // mes" (eso es un skipped normal), es "la actividad que
                // llegó está rota". Se cuenta aparte, no como skipped.
                result.invalidActivity++
                continue
            }

            const unitDays = validActivity.reduce((acc, a) => acc + unitDaysInPeriod(a, period), 0)
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
                    units: validActivity.length,
                    unit_days: unitDays,
                    days_in_period: daysInPeriod,
                    price_per_unit: price,
                    prorated: true,
                    discarded_units: discardedUnits,
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
