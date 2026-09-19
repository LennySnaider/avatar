/**
 * F5.2 (Estratega) — La regla PURA de "fila de `org_modules` → periodo
 * facturable", que es lo único con lógica del informador de actividad del
 * módulo `strategist` (`./unitActivity.ts`).
 *
 * POR QUÉ VIVE EN SU PROPIO FICHERO Y NO DENTRO DE `unitActivity.ts`: aquel
 * importa `registerUnitActivity` de `@/lib/billing/moduleFees`, que arrastra
 * `orgSupabase` → `@/lib/supabase`, que CONSTRUYE un `SupabaseClient` en su
 * ámbito de módulo y explota con "supabaseUrl is required." si no hay
 * variables de entorno — como al correr `tsx --test` fuera de Next.js
 * (comprobado). O sea: un test que importara `unitActivity.ts` no podría ni
 * arrancar. Y la registración TIENE que ser un efecto lateral síncrono del
 * import (el cron cuenta con ella), así que ahí no cabe el truco de la carga
 * dinámica que usa `src/lib/social/comments/settings.ts`. Partirlo es lo que
 * deja la regla probada de verdad, que es el punto de la regla del repo
 * "todo fichero puro tiene test".
 *
 * PURO: sólo un `import type` (se borra al compilar, no deja `require`).
 */
import type { UnitActivity } from '@/lib/billing/period'

/** Lo que hace falta de una fila `org_modules` para saber cuándo fue facturable. */
export interface StrategistModuleRow {
    installed_at: string | null
    uninstalled_at: string | null
    status: string
}

/**
 * Periodo facturable de la fila, o `null` si esa fila no factura nada.
 *
 * El módulo se factura por `unit='org'`: UNA unidad por organización, activa
 * desde que se instaló. Tres reglas, en este orden:
 *
 *  1. `installed_at` NULO → no hay periodo. La columna tiene default en la
 *     base, así que hoy no puede pasar; si pasara, tratar el nulo como
 *     "activo desde siempre" cobraría meses en los que el módulo no existía.
 *     Mismo criterio que la regla 1 de `telegramUnitActivity`
 *     (`src/lib/telegram/bots.ts`) con `connected_at`.
 *  2. `status = 'installed'` → sigue activo: `activeUntil: null`. Manda el
 *     estado, no la fecha: una fila instalada que conserve un
 *     `uninstalled_at` viejo (reinstalación — `setModuleStatus` reabre la
 *     MISMA fila) volvería a facturar desde su baja anterior si mirásemos
 *     primero la fecha.
 *  3. Cualquier otro estado → `uninstalled_at` es el fin del periodo.
 *
 * CASO CONOCIDO QUE NO SE ADIVINA: una fila desinstalada SIN `uninstalled_at`
 * saldría como "sigue activa". No se inventa una fecha de baja (`updated_at`
 * sería una aproximación, y aquí no hay un caso real que la justifique como
 * sí lo hay en `bots.ts`), y hoy no es alcanzable: `chargeModuleFees` sólo
 * llama a este informador para filas con `status='installed'`.
 */
export function rowToUnitActivity(
    row: StrategistModuleRow,
): UnitActivity | null {
    if (!row.installed_at) return null
    return {
        activeFrom: row.installed_at,
        activeUntil: row.status === 'installed' ? null : row.uninstalled_at,
    }
}
