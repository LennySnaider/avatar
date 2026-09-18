/**
 * Formateadores de los dashboards de ingresos. Puros (sin React ni DOM) y con
 * locale EXPLÍCITO siempre: un `toLocaleString()` sin locale da resultados
 * distintos en Node y en el navegador y rompe la hidratación de los Server
 * Components.
 *
 * Números en en-US (`$1,234.56`, `⭐ 1,234`), como ya hace `NumericFormat` en
 * el resto de la app: mezclar `$1,234.56` con `⭐ 1.234` en la misma fila
 * cambiaría el significado del punto y la coma. Fechas y tiempos relativos en
 * español.
 */
import type { EarningsBucket } from '@/lib/earnings/period'

const usd = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
})
const usdCompact = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
})
const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const compact = new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
})
const delta = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 1,
    signDisplay: 'exceptZero',
})

/** Centavos → `$1,234.56`. Negativos → `-$12.00`. */
export function formatUsdCents(cents: number): string {
    return usd.format(Math.round(cents) / 100)
}

/** Centavos → `$1.2K` (ejes y tiles grandes). Por debajo de $1,000 se muestra entero. */
export function formatUsdCompact(cents: number): string {
    const dollars = Math.round(cents) / 100
    return Math.abs(dollars) < 1000
        ? usd.format(dollars)
        : usdCompact.format(dollars)
}

/** Stars → `⭐ 1,234` (mismo glifo que TelegramSalesPanel). */
export function formatStars(stars: number): string {
    return `⭐ ${integer.format(Math.round(stars))}`
}

export function formatCount(n: number): string {
    return integer.format(Math.round(n))
}

export function formatCompact(n: number): string {
    return Math.abs(n) < 1000
        ? integer.format(Math.round(n))
        : compact.format(n)
}

/** `null` → `—`, `0` → `0%`, resto con signo: `+12.5%`, `-3%`. */
export function formatDeltaPct(pct: number | null): string {
    if (pct === null || Number.isNaN(pct)) return '—'
    if (pct === 0) return '0%'
    return `${delta.format(pct)}%`
}

function parseUtcDay(day: string): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day)
    if (!m) return null
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
}

const dayMonth = new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
})
const dayMonthYear = new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
})
const monthYearShort = new Intl.DateTimeFormat('es-ES', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
})
const monthYearLong = new Intl.DateTimeFormat('es-ES', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
})

/** Etiqueta corta de eje: día `3 sept`, semana `3 sept` (inicio), mes `sept 26`. */
export function formatBucketLabel(day: string, bucket: EarningsBucket): string {
    const d = parseUtcDay(day)
    if (!d) return ''
    return bucket === 'month' ? monthYearShort.format(d) : dayMonth.format(d)
}

/** Etiqueta larga de tooltip: `17 sept 2026`, `3–9 sept 2026`, `septiembre de 2026`. */
export function formatBucketRange(day: string, bucket: EarningsBucket): string {
    const d = parseUtcDay(day)
    if (!d) return ''
    if (bucket === 'month') return monthYearLong.format(d)
    if (bucket === 'week') {
        const end = new Date(d.getTime() + 6 * 86_400_000)
        return `${dayMonth.format(d)} – ${dayMonthYear.format(end)}`
    }
    return dayMonthYear.format(d)
}

const relative = new Intl.RelativeTimeFormat('es', { numeric: 'auto' })

/** `hace 12 min`, `ayer`, `hace 3 días`; `null` → `nunca`. */
export function formatRelativeTime(
    iso: string | null,
    now: number = Date.now(),
): string {
    if (!iso) return 'nunca'
    const then = Date.parse(iso)
    if (Number.isNaN(then)) return 'nunca'
    const seconds = Math.round((then - now) / 1000)
    const abs = Math.abs(seconds)
    if (abs < 60) return 'hace un momento'
    if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute')
    if (abs < 86_400) return relative.format(Math.round(seconds / 3600), 'hour')
    if (abs < 86_400 * 30)
        return relative.format(Math.round(seconds / 86_400), 'day')
    return relative.format(Math.round(seconds / (86_400 * 30)), 'month')
}

const dateTime = new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
})

export function formatDateTime(iso: string): string {
    const t = Date.parse(iso)
    return Number.isNaN(t) ? '' : dateTime.format(new Date(t))
}
