/**
 * Regla PURA "fila de `avatar_live_settings` → periodo facturable" de la
 * cuota mensual del módulo `live_avatar` (unidad = avatar con el modo en
 * vivo activado). Separada de `./unitActivity.ts` por lo mismo que
 * `src/lib/assistant/unitActivityRow.ts`: aquel importa el cron de cuotas,
 * que construye un cliente de Supabase al cargarse y no deja correr tests.
 *
 * Tres reglas, mismo criterio que `telegramUnitActivity`:
 *  1. `enabled_at` NULO → nunca se activó → no factura (no es "cero días").
 *  2. `disabled_at` presente → fin exacto del periodo.
 *  3. Apagado sin `disabled_at` → `updated_at` como aproximación del apagado.
 *  Si no, sigue activo (`activeUntil: null`).
 */
import type { UnitActivity } from '@/lib/billing/period'

export interface LiveSettingsActivityRow {
    enabled: boolean
    enabled_at: string | null
    disabled_at: string | null
    updated_at: string
}

export function liveRowToUnitActivity(row: LiveSettingsActivityRow): UnitActivity | null {
    if (!row.enabled_at) return null
    const activeUntil = row.disabled_at ?? (row.enabled ? null : row.updated_at)
    return { activeFrom: row.enabled_at, activeUntil }
}
