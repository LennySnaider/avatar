/**
 * Cobro por minuto de las llamadas en vivo (módulo live_avatar), APARTE de
 * la cuota mensual del módulo. Se cobra por minuto EMPEZADO, en cada
 * heartbeat y al colgar.
 *
 * Sin `OrgContext` (el visitante del link público es anónimo), así que va
 * por `chargeTokens`, que recibe la org ya resuelta de la fila de la sesión.
 * Anti doble cobro en dos capas: (1) el tramo de minutos se RECLAMA con un
 * update condicionado a `last_billed_minute` (dos heartbeats a la vez: sólo
 * uno gana), y (2) la clave de idempotencia del ledger lleva el tramo.
 *
 * Measure-only por defecto, como el resto de la facturación: con
 * `ENFORCE_LIMITS` apagado se asienta pero nunca se corta una llamada.
 * Exención de tenant escrita en check-tenant-access.mjs / eslint.config.mjs.
 */
import { orgSupabase } from '@/lib/org/orgTable'
import { chargeTokens, enforcementEnabled } from '@/lib/billing/wallet'
import { isBillingExempt } from '@/lib/billing/exemption'
import { quote } from '@/lib/billing/catalog'
import type { LiveSessionRow } from './session'
import { billableMinutes } from './policy'

/**
 * Asienta los minutos aún no cobrados. `untilMs` = ahora en el heartbeat;
 * al colgar o en el barrido, el último `last_seen_at` (no se cobra el tiempo
 * que el navegador ya no estaba).
 */
export async function chargeLiveMinutes(
    session: Pick<LiveSessionRow, 'id' | 'organization_id' | 'avatar_id' | 'source' | 'started_at' | 'last_billed_minute'>,
    untilMs: number,
    maxSessionSeconds: number,
): Promise<void> {
    const target = billableMinutes(session.started_at, untilMs, maxSessionSeconds)
    const from = session.last_billed_minute
    if (target <= from) return
    const { data: claimed } = await orgSupabase()
        .from('live_sessions')
        .update({ last_billed_minute: target, billed_seconds: target * 60 })
        .eq('organization_id', session.organization_id)
        .eq('id', session.id)
        .eq('last_billed_minute', from)
        .select('id')
    if (!claimed?.length) return // otro heartbeat ya cobró este tramo

    const q = quote({ kind: 'live_minute', minutes: target - from })
    const res = await chargeTokens({
        organizationId: session.organization_id,
        tokens: q.tokens,
        sku: q.sku,
        refType: 'live_session',
        refId: session.id,
        idempotencyKey: `live:${session.id}:${from + 1}-${target}`,
        costUsd: q.costUsd,
        metadata: { avatarId: session.avatar_id, source: session.source, minutes: target - from },
    })
    if (!res.ok) {
        console.error('[live billing] no se pudo asentar el cobro por minuto', {
            sessionId: session.id,
            minutes: `${from + 1}-${target}`,
            reason: res.reason,
        })
    }
}

/**
 * ¿Puede esta org abrir o seguir una llamada? Sólo dice que no con
 * `ENFORCE_LIMITS` encendido, sin exención de cobro y con el saldo a cero.
 * Un fallo leyendo el saldo deja pasar (la llamada ya se está asentando).
 */
export async function hasLiveBalance(organizationId: string): Promise<boolean> {
    if (!enforcementEnabled()) return true
    if (await isBillingExempt(organizationId)) return true
    const { data, error } = await orgSupabase()
        .from('org_wallets')
        .select('included_balance, purchased_balance')
        .eq('organization_id', organizationId)
        .maybeSingle()
    if (error) {
        console.error('[live billing] no se pudo leer el saldo (se deja pasar)', error.message)
        return true
    }
    return (data?.included_balance ?? 0) + (data?.purchased_balance ?? 0) > 0
}
