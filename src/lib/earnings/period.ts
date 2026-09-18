/**
 * Períodos y series de los dashboards de ingresos. Módulo PURO: sin imports
 * de base de datos ni de Next, para poder testearlo con `tsx --test` sin
 * variables de entorno (misma regla que `src/lib/billing/period.ts`).
 *
 * TODO EN UTC. Fanvue reporta sus días en UTC y `telegram_stars_sales.
 * purchased_at` se estampa en ISO UTC, así que "hoy" y los bordes de cada
 * preset se calculan en UTC y no en la zona del servidor ni del navegador. Un
 * usuario en UTC-5 ve cambiar "hoy" a las 19:00 de su reloj — documentado, no
 * corregido en v1.
 *
 * Los presets comparan SIEMPRE contra un tramo anterior de la misma longitud:
 *   - 7d / 30d / 90d: los últimos N días incluyendo hoy, contra los N días
 *     inmediatamente anteriores.
 *   - thisMonth: del 1 a hoy, contra del 1 al MISMO día del mes anterior
 *     (recortado a la longitud de ese mes: el 31 de marzo compara contra el
 *     28/29 de febrero). Es "mes en curso vs mismo punto del mes pasado".
 *   - lastMonth: el mes anterior completo contra el que le precede.
 *   - 12m: desde el día 1 de hace 11 meses hasta hoy, contra los 12 meses
 *     anteriores a ese día 1. Se agrupa por mes.
 *
 * Las dos unidades de dinero (centavos de USD de Fanvue, Stars de Telegram)
 * viajan en campos separados y NUNCA se suman entre sí. Aquí no hay ninguna
 * conversión y no debe haberla: ver `STAR_USD` en `src/lib/billing/catalog.ts`
 * y la regla de `TelegramSalesPanel.tsx`.
 */

export const EARNINGS_PRESETS = [
    '7d',
    '30d',
    '90d',
    'thisMonth',
    'lastMonth',
    '12m',
] as const
export type EarningsPreset = (typeof EARNINGS_PRESETS)[number]

/** Cómo se agrupa la serie: por día (rangos cortos), por tramos de 7 días o por mes natural. */
export type EarningsBucket = 'day' | 'week' | 'month'

export interface PeriodWindow {
    preset: EarningsPreset
    /** 'YYYY-MM-DD' UTC, inclusive. */
    from: string
    /** 'YYYY-MM-DD' UTC, inclusive. */
    to: string
    prevFrom: string
    prevTo: string
    /** Días del tramo actual (inclusive). */
    days: number
    bucket: EarningsBucket
}

/** Un punto de la serie. `day` es el inicio del bucket ('YYYY-MM-DD'). */
export interface EarningsPoint {
    day: string
    fanvueGrossCents: number
    fanvueNetCents: number
    stars: number
    telegramSales: number
}

/** Fila tal como la devuelve el RPC `earnings_series` (snake_case a propósito). */
export interface SeriesRowInput {
    day: string
    source: string
    usd_gross_cents: number
    usd_net_cents: number
    stars: number
    sales_count: number
}

export type EarningsTotals = Omit<EarningsPoint, 'day'>

export function isEarningsPreset(value: unknown): value is EarningsPreset {
    return (
        typeof value === 'string' &&
        (EARNINGS_PRESETS as readonly string[]).includes(value)
    )
}

const DAY_MS = 86_400_000

function parseDay(day: string): number {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
    if (!m) throw new Error(`Día inválido (se esperaba YYYY-MM-DD): ${day}`)
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

function toDay(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10)
}

/** 'YYYY-MM-DD' de hoy en UTC. */
export function utcToday(now: Date = new Date()): string {
    return now.toISOString().slice(0, 10)
}

export function addDaysIso(day: string, n: number): string {
    return toDay(parseDay(day) + n * DAY_MS)
}

/** Días inclusive entre dos fechas (from === to → 1). */
export function daysBetween(from: string, to: string): number {
    return Math.round((parseDay(to) - parseDay(from)) / DAY_MS) + 1
}

export function enumerateDays(from: string, to: string): string[] {
    const out: string[] = []
    const end = parseDay(to)
    for (let t = parseDay(from); t <= end; t += DAY_MS) out.push(toDay(t))
    return out
}

/** Primer día del mes de `day`. */
function firstOfMonth(day: string): string {
    return `${day.slice(0, 7)}-01`
}

/** Primer día del mes que está `n` meses antes del mes de `day`. */
function firstOfMonthMinus(day: string, n: number): string {
    const [y, m] = day.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1 - n, 1)).toISOString().slice(0, 10)
}

/** Último día del mes de `day`. */
function lastOfMonth(day: string): string {
    const [y, m] = day.split('-').map(Number)
    // Día 0 del mes siguiente = último día de este mes.
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

/** ≤ 92 días → por día; ≤ 200 → tramos de 7 días; más → mes natural. */
export function bucketFor(days: number): EarningsBucket {
    if (days <= 92) return 'day'
    if (days <= 200) return 'week'
    return 'month'
}

export function resolvePeriod(
    preset: EarningsPreset,
    now: Date = new Date(),
): PeriodWindow {
    const today = utcToday(now)
    let from: string
    let to: string
    let prevFrom: string
    let prevTo: string
    let bucket: EarningsBucket | null = null

    switch (preset) {
        case '7d':
        case '30d':
        case '90d': {
            const n = Number(preset.slice(0, -1))
            to = today
            from = addDaysIso(today, -(n - 1))
            prevTo = addDaysIso(from, -1)
            prevFrom = addDaysIso(prevTo, -(n - 1))
            break
        }
        case 'thisMonth': {
            from = firstOfMonth(today)
            to = today
            prevFrom = firstOfMonthMinus(today, 1)
            // Mismo día del mes anterior, recortado a su longitud.
            const sameDay = addDaysIso(prevFrom, daysBetween(from, to) - 1)
            const prevLast = lastOfMonth(prevFrom)
            prevTo = sameDay < prevLast ? sameDay : prevLast
            break
        }
        case 'lastMonth': {
            from = firstOfMonthMinus(today, 1)
            to = lastOfMonth(from)
            prevFrom = firstOfMonthMinus(today, 2)
            prevTo = lastOfMonth(prevFrom)
            break
        }
        case '12m': {
            from = firstOfMonthMinus(today, 11)
            to = today
            prevFrom = firstOfMonthMinus(from, 12)
            prevTo = addDaysIso(from, -1)
            bucket = 'month'
            break
        }
        default: {
            // `never` en tipos; en runtime el preset viene de la URL.
            throw new Error(`Preset de período desconocido: ${String(preset)}`)
        }
    }

    const days = daysBetween(from, to)
    return {
        preset,
        from,
        to,
        prevFrom,
        prevTo,
        days,
        bucket: bucket ?? bucketFor(days),
    }
}

export function emptyPoint(day: string): EarningsPoint {
    return {
        day,
        fanvueGrossCents: 0,
        fanvueNetCents: 0,
        stars: 0,
        telegramSales: 0,
    }
}

/**
 * Serie DENSA por día: un punto por cada día del rango, con ceros donde no
 * hubo nada, y las filas de las dos fuentes fundidas en el mismo punto. Las
 * filas fuera de rango o de fuente desconocida se ignoran (no se mezclan
 * unidades por accidente).
 */
export function toDensePoints(
    from: string,
    to: string,
    rows: SeriesRowInput[],
): EarningsPoint[] {
    const byDay = new Map<string, EarningsPoint>()
    for (const day of enumerateDays(from, to)) byDay.set(day, emptyPoint(day))
    for (const row of rows) {
        const day = row.day.slice(0, 10)
        const point = byDay.get(day)
        if (!point) continue
        if (row.source === 'fanvue') {
            point.fanvueGrossCents += Number(row.usd_gross_cents) || 0
            point.fanvueNetCents += Number(row.usd_net_cents) || 0
        } else if (row.source === 'telegram') {
            point.stars += Number(row.stars) || 0
            point.telegramSales += Number(row.sales_count) || 0
        }
    }
    return [...byDay.values()]
}

/**
 * Agrupa una serie diaria. `week` son tramos consecutivos de 7 días contados
 * desde el PRIMER punto (no semanas ISO): así el tramo actual y el anterior,
 * que tienen la misma longitud, producen el mismo número de buckets y se
 * pueden comparar índice a índice. `month` es el mes natural.
 */
export function bucketSeries(
    points: EarningsPoint[],
    bucket: EarningsBucket,
): EarningsPoint[] {
    if (bucket === 'day' || points.length === 0) return points
    const out: EarningsPoint[] = []
    const index = new Map<string, EarningsPoint>()
    points.forEach((p, i) => {
        const key =
            bucket === 'month'
                ? firstOfMonth(p.day)
                : points[Math.floor(i / 7) * 7].day
        let target = index.get(key)
        if (!target) {
            target = emptyPoint(key)
            index.set(key, target)
            out.push(target)
        }
        target.fanvueGrossCents += p.fanvueGrossCents
        target.fanvueNetCents += p.fanvueNetCents
        target.stars += p.stars
        target.telegramSales += p.telegramSales
    })
    return out
}

/**
 * Deja la serie anterior con la MISMA longitud que la actual: rellena con
 * ceros (día vacío) si es más corta y recorta si es más larga. La gráfica las
 * pinta índice a índice.
 */
export function alignPrevious(
    current: EarningsPoint[],
    previous: EarningsPoint[],
): EarningsPoint[] {
    const out = previous.slice(0, current.length)
    while (out.length < current.length) out.push(emptyPoint(''))
    return out
}

export function sumPoints(points: EarningsPoint[]): EarningsTotals {
    const total: EarningsTotals = {
        fanvueGrossCents: 0,
        fanvueNetCents: 0,
        stars: 0,
        telegramSales: 0,
    }
    for (const p of points) {
        total.fanvueGrossCents += p.fanvueGrossCents
        total.fanvueNetCents += p.fanvueNetCents
        total.stars += p.stars
        total.telegramSales += p.telegramSales
    }
    return total
}

/**
 * Variación porcentual, redondeada a un decimal. `null` cuando no hay base
 * de comparación (prev = 0): un "+∞%" o un "+100%" desde cero engañan más de
 * lo que informan, y la UI lo pinta como "—".
 */
export function pctChange(current: number, previous: number): number | null {
    if (!previous) return null
    return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10
}
