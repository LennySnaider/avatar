/**
 * Núcleo del cron `earnings-sync`: trae de Fanvue los ingresos diarios por
 * creator y los deja en `fanvue_daily_earnings`.
 *
 * Corre SIN sesión (lo dispara el cron o `refreshEarnings` con la conexión de
 * la org ya resuelta). Mismo perfil que `src/lib/billing/moduleFees.ts`:
 * `listFanvueConnectionsForSync` barre `fanvue_connections` de TODAS las orgs
 * a propósito —es la lista con la que arranca el cron— y
 * `syncOrgFanvueEarnings` recibe la `organizationId` de ESA fila por parámetro
 * y la usa como filtro explícito en sus dos accesos restantes. Por eso está
 * exento del candado de `orgSupabase` (eslint.config.mjs y
 * scripts/check-tenant-access.mjs, con el motivo escrito allí).
 *
 * Va por `orgSupabase` y no por `agentSupabase` porque el schema extendido de
 * `@/lib/agent/db` no declara `fanvue_connections` ni `fanvue_daily_earnings`
 * (TS2769, mismo caso que `telegram/offerEngine.ts`).
 *
 * CANDADO DE TOKEN. `getValidAccessToken(userId)` resuelve la conexión por la
 * PRIMERA membresía del usuario (ver `tokenStore.ts`), que no tiene por qué ser
 * la org de la fila que estamos sincronizando. Si no coinciden, se salta la org
 * con `connection_mismatch` en vez de sincronizar con el token de OTRA org.
 *
 * VENTANA AUTORITATIVA. Para cada (creator, día) de la ventana que Fanvue NO
 * devuelve se escribe un 0: así un día que Fanvue corrija a cero no se queda
 * viejo en la tabla, y `synced_at` significa "este día se miró", no "este día
 * tuvo ventas". El coste es creators × días filas (50 × 90 = 4.500 en una
 * rebanada de backfill), en lotes de 500.
 */
import { orgSupabase } from '@/lib/org/orgTable'
import { loadConnection, getValidAccessToken } from '@/lib/fanvue/tokenStore'
import { FanvueClient, AGENCY_EARNINGS_PATH } from '@/lib/fanvue/FanvueClient'
import type { FanvueAgencyEarningsRow } from '@/lib/fanvue/types'
import { enumerateDays } from './period'

export interface FanvueSyncConnection {
    connectionId: string
    organizationId: string
    userId: string
}

export interface FanvueSyncInput extends FanvueSyncConnection {
    /** 'YYYY-MM-DD' UTC, inclusive. */
    from: string
    /** 'YYYY-MM-DD' UTC, inclusive. */
    to: string
    /** Sólo lee la primera página y la devuelve en `sample`; no escribe nada. */
    dryRun?: boolean
    /** Ruta alternativa del endpoint, sólo con `dryRun` (spike de verificación). */
    path?: string
}

export type FanvueSyncSkipReason =
    | 'no_connection'
    | 'connection_mismatch'
    | 'no_mapped_creators'

export interface FanvueSyncResult {
    organizationId: string
    creators: number
    pages: number
    rowsFetched: number
    rowsUpserted: number
    /** Filas en otra moneda que USD: se descartan y se cuentan aquí. */
    nonUsdRows: number
    /** Se agotó el tope de páginas antes de llegar al final: la ventana quedó incompleta. */
    truncated: boolean
    skipped?: FanvueSyncSkipReason
    /** Sólo en dryRun: las primeras filas crudas que devolvió Fanvue. */
    sample?: FanvueAgencyEarningsRow[]
    path: string
}

const CREATORS_PER_CALL = 50
const UPSERT_BATCH = 500

/** Conexiones de Fanvue con refresh token (o sólo la de una org, si se pide). */
export async function listFanvueConnectionsForSync(
    organizationId?: string,
): Promise<FanvueSyncConnection[]> {
    let query = orgSupabase()
        .from('fanvue_connections')
        .select('id, organization_id, user_id')
        .not('refresh_token', 'is', null)
    if (organizationId) query = query.eq('organization_id', organizationId)
    const { data, error } = await query
    if (error) throw new Error(`fanvue_connections: ${error.message}`)
    return (data ?? []).map((row) => ({
        connectionId: row.id,
        organizationId: row.organization_id,
        userId: row.user_id,
    }))
}

function chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = []
    for (let i = 0; i < items.length; i += size)
        out.push(items.slice(i, i + size))
    return out
}

export async function syncOrgFanvueEarnings(
    input: FanvueSyncInput,
): Promise<FanvueSyncResult> {
    const path = (input.dryRun && input.path) || AGENCY_EARNINGS_PATH
    const base: FanvueSyncResult = {
        organizationId: input.organizationId,
        creators: 0,
        pages: 0,
        rowsFetched: 0,
        rowsUpserted: 0,
        nonUsdRows: 0,
        truncated: false,
        path,
    }

    // 1) La conexión que resuelve el token store tiene que ser ESTA (ver
    //    cabecera): si el usuario que conectó tiene otra org como primera
    //    membresía, el token sería de otra org.
    const connection = await loadConnection(input.userId)
    if (!connection?.refreshToken) return { ...base, skipped: 'no_connection' }
    if (connection.id !== input.connectionId) {
        console.warn(
            `[earnings-sync] org ${input.organizationId}: la conexión que resuelve el usuario ${input.userId} (${connection.id}) no es la de la org (${input.connectionId}) — se salta.`,
        )
        return { ...base, skipped: 'connection_mismatch' }
    }

    // 2) Creators que algún avatar de ESTA org tiene asignado.
    const { data: avatarRows, error: avatarsError } = await orgSupabase()
        .from('avatars')
        .select('fanvue_creator_uuid')
        .eq('organization_id', input.organizationId)
        .not('fanvue_creator_uuid', 'is', null)
    if (avatarsError) throw new Error(`avatars: ${avatarsError.message}`)
    const creators = [
        ...new Set(
            (avatarRows ?? [])
                .map((r) => r.fanvue_creator_uuid)
                .filter(
                    (v): v is string => typeof v === 'string' && v.length > 0,
                ),
        ),
    ]
    base.creators = creators.length
    if (creators.length === 0) return { ...base, skipped: 'no_mapped_creators' }

    // 3) Fanvue: endDate es EXCLUSIVO → el primer instante del día siguiente.
    const client = new FanvueClient({
        getAccessToken: (opts) => getValidAccessToken(input.userId, opts),
    })
    const days = enumerateDays(input.from, input.to)
    const startDate = `${input.from}T00:00:00.000Z`
    const endDate = new Date(
        Date.parse(`${input.to}T00:00:00.000Z`) + 86_400_000,
    ).toISOString()

    if (input.dryRun) {
        const page = await client.listAgencyEarnings(
            {
                startDate,
                endDate,
                creatorUuids: creators.slice(0, CREATORS_PER_CALL),
                size: 50,
            },
            { path },
        )
        return {
            ...base,
            pages: 1,
            rowsFetched: page.data.length,
            sample: page.data.slice(0, 5),
            truncated: Boolean(page.pagination?.hasMore),
        }
    }

    const fetched: FanvueAgencyEarningsRow[] = []
    let pages = 0
    let truncated = false
    for (const group of chunk(creators, CREATORS_PER_CALL)) {
        // Como mucho una fila por creator y día, 50 por página, más un margen.
        const maxPages = Math.min(
            400,
            Math.ceil((group.length * days.length) / 50) + 2,
        )
        const result = await client.listAllAgencyEarnings(
            { startDate, endDate, creatorUuids: group, size: 50 },
            { maxPages },
        )
        fetched.push(...result.rows)
        pages += result.pages
        truncated = truncated || result.truncated
    }
    base.pages = pages
    base.rowsFetched = fetched.length
    base.truncated = truncated
    if (truncated) {
        console.error(
            `[earnings-sync] org ${input.organizationId}: se agotó el tope de páginas en ${input.from}..${input.to} — la ventana quedó incompleta.`,
        )
    }

    // 4) Índice creator|día → fila, descartando lo que no sea USD.
    const byKey = new Map<string, FanvueAgencyEarningsRow>()
    for (const row of fetched) {
        if ((row.currency ?? 'USD').toUpperCase() !== 'USD') {
            base.nonUsdRows += 1
            continue
        }
        const day = String(row.date).slice(0, 10)
        const key = `${row.creatorUuid}|${day}`
        const prev = byKey.get(key)
        // Si Fanvue devolviera dos filas del mismo creator y día (no debería),
        // se suman: mejor que perder una en silencio.
        byKey.set(
            key,
            prev
                ? {
                      ...prev,
                      gross: prev.gross + row.gross,
                      net: prev.net + row.net,
                  }
                : { ...row, date: day },
        )
    }
    if (base.nonUsdRows > 0) {
        console.warn(
            `[earnings-sync] org ${input.organizationId}: ${base.nonUsdRows} filas en moneda distinta de USD descartadas.`,
        )
    }

    // 5) Ventana autoritativa: ceros donde Fanvue no devolvió nada.
    const nowIso = new Date().toISOString()
    const upserts = []
    for (const creatorUuid of creators) {
        for (const day of days) {
            const row = byKey.get(`${creatorUuid}|${day}`)
            upserts.push({
                organization_id: input.organizationId,
                creator_uuid: creatorUuid,
                day,
                gross_cents: row ? Math.round(row.gross) : 0,
                net_cents: row ? Math.round(row.net) : 0,
                currency: 'USD',
                synced_at: nowIso,
            })
        }
    }
    for (const batch of chunk(upserts, UPSERT_BATCH)) {
        const { error } = await orgSupabase()
            .from('fanvue_daily_earnings')
            .upsert(batch, { onConflict: 'organization_id,creator_uuid,day' })
        if (error)
            throw new Error(`fanvue_daily_earnings upsert: ${error.message}`)
        base.rowsUpserted += batch.length
    }
    return base
}
