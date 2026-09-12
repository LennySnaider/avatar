/**
 * Aritmética PURA de periodos de facturación: mes 'YYYY-MM' en UTC, sus
 * límites, y cuántos días naturales tocó una unidad dentro de un periodo.
 *
 * A propósito CERO imports de base de datos (nada de `orgTable`, `supabase`
 * ni `wallet`): quien importe este fichero no arrastra ningún cliente ni
 * necesita variables de entorno. `moduleFees.ts` sí las arrastra (cron con
 * cliente de datos), así que la aritmética vive aquí y no allá — separado,
 * se puede probar con `npm test` sin entorno, y una pantalla de sólo lectura
 * (`moduleSummary.ts`) puede pedir "qué mes es" sin cargar el cron ni el
 * registro de unidades ni el cliente de facturación.
 */

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
export function periodBounds(period: string): { start: number; end: number; days: number } {
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
