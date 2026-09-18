/**
 * Lecturas agregadas de los dashboards de ingresos. SÓLO RPCs.
 *
 * Por qué RPC y no `orgTable(...).select()` sumando en memoria: la capa REST
 * de Supabase (PostgREST) corta en 1000 filas EN SILENCIO (ver la advertencia
 * en `src/lib/billing/moduleSummary.ts`). Una org con 20 avatares y 90 días
 * son miles de filas de ventas; agregando en SQL, `earnings_series` devuelve
 * como mucho (días × 2) filas y `earnings_by_avatar` (avatares × 2).
 *
 * EXENTO del candado de `orgSupabase` (eslint.config.mjs, tercer bloque):
 * `orgTable` no sabe pre-scopear un `.rpc()`, así que la organización viaja
 * por parámetro (`p_org`) y cada función SQL la filtra en TODAS sus consultas
 * (migración 20260917150000_earnings_dashboards). No hay ni un `.from()` en
 * este fichero. Mismo caso que `src/lib/agent/retrieval.ts`.
 */
import { orgSupabase } from '@/lib/org/orgTable'

export type EarningsSource = 'fanvue' | 'telegram'

export interface EarningsSeriesRow {
    /** 'YYYY-MM-DD' (Postgres `date`, sin hora). */
    day: string
    source: EarningsSource
    usd_gross_cents: number
    usd_net_cents: number
    stars: number
    sales_count: number
}

export interface EarningsByAvatarRow {
    avatar_id: string
    source: EarningsSource
    usd_gross_cents: number
    usd_net_cents: number
    stars: number
    sales_count: number
}

/**
 * Techo que PostgREST aplica también a los RPC que devuelven `setof`. La serie
 * no puede llegar (≤ 732 filas por construcción); el ranking sólo con más de
 * 500 avatares. Si se alcanza, se avisa por log y el llamador marca
 * `truncated`.
 */
export const RPC_ROW_CAP = 1000

export async function fetchEarningsSeries(
    organizationId: string,
    from: string,
    to: string,
    avatarId?: string | null,
): Promise<{ rows: EarningsSeriesRow[]; truncated: boolean }> {
    const { data, error } = await orgSupabase().rpc('earnings_series', {
        p_org: organizationId,
        p_from: from,
        p_to: to,
        ...(avatarId ? { p_avatar: avatarId } : {}),
    })
    if (error) throw new Error(`earnings_series: ${error.message}`)
    const rows = (data ?? []) as EarningsSeriesRow[]
    const truncated = rows.length >= RPC_ROW_CAP
    if (truncated) {
        console.error(
            `[earnings] earnings_series(${organizationId}, ${from}..${to}) devolvió ${rows.length} filas: posible truncamiento de PostgREST.`,
        )
    }
    return { rows, truncated }
}

export async function fetchEarningsByAvatar(
    organizationId: string,
    from: string,
    to: string,
): Promise<{ rows: EarningsByAvatarRow[]; truncated: boolean }> {
    const { data, error } = await orgSupabase().rpc('earnings_by_avatar', {
        p_org: organizationId,
        p_from: from,
        p_to: to,
    })
    if (error) throw new Error(`earnings_by_avatar: ${error.message}`)
    const rows = (data ?? []) as EarningsByAvatarRow[]
    const truncated = rows.length >= RPC_ROW_CAP
    if (truncated) {
        console.error(
            `[earnings] earnings_by_avatar(${organizationId}, ${from}..${to}) devolvió ${rows.length} filas: posible truncamiento de PostgREST.`,
        )
    }
    return { rows, truncated }
}
