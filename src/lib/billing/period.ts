/**
 * Aritmética PURA de periodos de facturación: mes 'YYYY-MM' en UTC, sus
 * límites, cuántos días naturales tocó una unidad dentro de un periodo, y si
 * una entrada de actividad es siquiera utilizable.
 *
 * A propósito CERO imports de base de datos (nada de `orgTable`, `supabase`
 * ni `wallet`): quien importe este fichero no arrastra ningún cliente ni
 * necesita variables de entorno. `moduleFees.ts` sí las arrastra (cron con
 * cliente de datos), así que la aritmética vive aquí y no allá — separado,
 * se puede probar con `npm test` sin entorno, y una pantalla de sólo lectura
 * (`moduleSummary.ts`) puede pedir "qué mes es" sin cargar el cron ni el
 * registro de unidades ni el cliente de facturación.
 *
 * Puro también significa que este fichero NUNCA avisa de nada (ni
 * `console.warn` ni métricas): ante una entrada rota se limita a decirlo
 * (`isUnitActivityValid`) o a tratarla como cero días (`unitDaysInPeriod`).
 * Registrar que ocurrió es responsabilidad de quien tiene el contexto de
 * organización y módulo — eso vive en `moduleFees.ts`.
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

/**
 * Si una entrada de actividad es utilizable para el prorrateo.
 *
 * Rechaza tres formas de dato roto: `activeFrom` no interpretable como
 * fecha, `activeUntil` presente pero no interpretable, y `activeUntil`
 * anterior o igual a `activeFrom` (un fin no puede preceder ni coincidir con
 * su propio inicio). `activeUntil: null` SÍ es válido — significa "sigue
 * activa", no "dato roto".
 *
 * Existe para eliminar una asimetría peligrosa: sin esta función, un
 * `activeFrom` roto y un `activeUntil` roto tomaban caminos distintos (el
 * primero cobraba de menos, el segundo de más) y ninguno de los dos avisaba.
 * Con esta función los dos casos son exactamente lo mismo: inválido.
 */
export function isUnitActivityValid(activity: UnitActivity): boolean {
    const from = Date.parse(activity.activeFrom)
    if (!Number.isFinite(from)) return false
    if (activity.activeUntil === null) return true
    const until = Date.parse(activity.activeUntil)
    if (!Number.isFinite(until)) return false
    return until > from
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
const PERIOD_FORMAT = /^(\d{4})-(0[1-9]|1[0-2])$/

/**
 * Límites [inicio, fin) del mes en UTC, y cuántos días tiene.
 *
 * Lanza si `period` no tiene la forma `YYYY-MM` con mes de 01 a 12: un
 * desbordamiento como "2026-13" no se normaliza en silencio a enero de 2027
 * (`Date.UTC` sí lo haría) porque un resultado plausible y falso es peor que
 * un fallo explícito — sobre todo el día en que esta función quede detrás de
 * un endpoint que reciba el periodo desde fuera.
 */
export function periodBounds(period: string): { start: number; end: number; days: number } {
    const match = PERIOD_FORMAT.exec(period)
    if (!match) {
        throw new Error(`[period] período inválido: "${period}" — se esperaba "YYYY-MM" con mes entre 01 y 12.`)
    }
    const year = Number(match[1])
    const month = Number(match[2])
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
 *
 * Una entrada inválida (ver `isUnitActivityValid`) da SIEMPRE cero, sea cual
 * sea el motivo — nunca "sigue activa hasta el cierre" para un `activeUntil`
 * roto: esa asimetría era la que sobrecobraba en silencio.
 */
export function unitDaysInPeriod(activity: UnitActivity, period: string): number {
    if (!isUnitActivityValid(activity)) return 0

    const { start, end, days } = periodBounds(period)
    const from = Date.parse(activity.activeFrom)
    const until = activity.activeUntil ? Date.parse(activity.activeUntil) : end

    const overlapStart = Math.max(from, start)
    const overlapEnd = Math.min(until, end)
    if (overlapEnd <= overlapStart) return 0

    const firstDay = Math.floor(overlapStart / DAY_MS)
    const lastDay = Math.ceil(overlapEnd / DAY_MS)
    return Math.min(lastDay - firstDay, days)
}
