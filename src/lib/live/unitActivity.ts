/**
 * Informe de actividad facturable del módulo `live_avatar` para
 * `chargeModuleFees` (`@/lib/billing/moduleFees`): cuándo estuvo activado el
 * modo en vivo de cada avatar de la organización.
 *
 * SIN SESIÓN, igual que `src/lib/telegram/bots.ts`: lo dispara el cron de
 * cuotas; la organizationId llega por parámetro y la única consulta la
 * filtra con `.eq('organization_id', …)`. Exención escrita en
 * `scripts/check-tenant-access.mjs` y `eslint.config.mjs`.
 */
import { orgSupabase } from '@/lib/org/orgTable'
import { registerUnitActivity } from '@/lib/billing/moduleFees'
import type { UnitActivity } from '@/lib/billing/period'
import { liveRowToUnitActivity, type LiveSettingsActivityRow } from './unitActivityRow'

const MODULE_SLUG = 'live_avatar'

export async function liveUnitActivity(organizationId: string): Promise<UnitActivity[]> {
    const { data, error } = await orgSupabase()
        .from('avatar_live_settings')
        .select('enabled, enabled_at, disabled_at, updated_at')
        .eq('organization_id', organizationId)
    if (error) throw new Error(error.message)
    const activity: UnitActivity[] = []
    for (const row of (data ?? []) as LiveSettingsActivityRow[]) {
        const periodo = liveRowToUnitActivity(row)
        if (periodo) activity.push(periodo)
    }
    return activity
}

// Efecto lateral DELIBERADO (ver el mismo comentario en bots.ts): sin este
// registro el cron salta la cuota de `live_avatar` en silencio. Lo importa
// `src/app/api/cron/module-fees/route.ts` sólo por esto.
registerUnitActivity(MODULE_SLUG, liveUnitActivity)
