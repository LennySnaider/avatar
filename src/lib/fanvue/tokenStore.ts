/**
 * Persistence + refresh orchestration for the single agency OAuth connection
 * per ORGANIZATION. All access uses the Supabase service-role client; tokens
 * never leave the server.
 *
 * F4.2.f — la conexión es DE LA ORG, no del usuario: `fanvue_connections`
 * sólo tiene `unique(organization_id)` desde la migración 4.1 (no existe
 * ningún índice único sobre `user_id`). `user_id` se sigue guardando —dice
 * QUIÉN conectó— pero deja de ser la clave de identidad: dos usuarios de la
 * misma org comparten la MISMA conexión. Por eso toda función de aquí
 * resuelve primero la org de `userId` (vía `getOrgContextForUser`, la
 * variante sin sesión pensada para esto) y filtra/conflictúa por
 * `organization_id`, nunca por `user_id`.
 *
 * Refresh-token rotation: Fanvue rotates the refresh token on every refresh
 * (single-use, 30s grace). We (a) serialize refreshes per ORG with an
 * in-process mutex so a token is never spent twice concurrently — ahora que
 * la conexión es de la org, dos usuarios de la MISMA org refrescando a la vez
 * tienen que serializarse entre sí, no sólo contra sí mismos—, and (b)
 * persist the NEW refresh token + expiry BEFORE returning the access token.
 */
import { orgTable, orgUpsert } from '@/lib/org/orgTable'
import { getOrgContextForUser } from '@/lib/tenant/getOrgContext'
import type { Database } from '@/@types/database.generated'
import { refreshTokens } from './oauth'
import type { FanvueTokens } from './types'

type FanvueConnectionRow = Database['public']['Tables']['fanvue_connections']['Row']

// El extend local a `@/@types/supabase` (fanvueSupabase()) que vivía aquí
// quedó obsoleto (su Insert/Update no declaraban organization_id, lo que
// habría bloqueado en tipos el fix de abajo) y se retiró: fanvue_connections
// pasa por orgTable/orgUpsert (@/lib/org/orgTable), igual que el resto de
// tablas tenant — `database.generated.ts` ya trae fanvue_* con
// organization_id incluido, sin necesidad de un tipo propio.

// --- Connection records -------------------------------------------------------

export interface FanvueConnectionRecord {
    id: string
    userId: string
    accessToken: string | null
    refreshToken: string | null
    tokenExpiresAt: string | null
    scopes: string[] | null
    fanvueAccountUuid: string | null
}

/**
 * Load the agency connection for the ORG that `userId` belongs to, or `null`
 * si no hay conexión (o el usuario no tiene membresía de org). Dos usuarios
 * de la misma org que llamen esto con distinto `userId` obtienen la MISMA
 * fila — la conexión es de la org, no de quien la conectó.
 */
export async function loadConnection(
    userId: string,
): Promise<FanvueConnectionRecord | null> {
    const ctx = await getOrgContextForUser(userId)
    if (!ctx) return null // sin membresía no hay org de la cual traer conexión
    const { data, error } = await orgTable(ctx, 'fanvue_connections')
        .select('*')
        .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null
    // orgTable devuelve el builder sin tipar (ver el gotcha documentado en
    // orgTable.ts); el cast va aquí, después del guard de arriba.
    const row = data as FanvueConnectionRow
    return {
        id: row.id,
        userId: row.user_id,
        accessToken: row.access_token,
        refreshToken: row.refresh_token,
        tokenExpiresAt: row.token_expires_at,
        scopes: row.scopes,
        fanvueAccountUuid: row.fanvue_account_uuid,
    }
}

/** Create/replace the connection after a successful code exchange. */
export async function upsertConnection(
    userId: string,
    tokens: FanvueTokens,
    fanvueAccountUuid?: string | null,
): Promise<void> {
    const ctx = await getOrgContextForUser(userId)
    if (!ctx) throw new Error('No organization membership for this user')
    // HALLAZGO VERIFICADO CONTRA LA BD (2026-08-20): el conflicto va contra
    // `organization_id` porque es el ÚNICO índice único que existe sobre
    // `fanvue_connections` desde la migración 4.1 (`fanvue_connections_org_key`).
    // Apuntar a `user_id` (como estaba) tira 42P10 — Postgres exige un unique
    // real detrás del ON CONFLICT y ese ya no existe — así que reconectar
    // Fanvue estaba roto en producción desde el 18-jul.
    const { error } = await orgUpsert(
        ctx,
        'fanvue_connections',
        {
            user_id: userId,
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
            token_expires_at: tokens.expiresAt,
            scopes: tokens.scopes,
            ...(fanvueAccountUuid !== undefined
                ? { fanvue_account_uuid: fanvueAccountUuid }
                : {}),
            updated_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id' },
    )
    if (error) throw new Error(error.message)
}

async function persistTokens(
    userId: string,
    tokens: FanvueTokens,
): Promise<void> {
    const ctx = await getOrgContextForUser(userId)
    if (!ctx) throw new Error('No organization membership for this user')
    // orgTable ya filtra el UPDATE por organization_id; con el unique de org
    // hay como mucho una fila, así que no hace falta (ni corresponde, ver
    // arriba) un .eq('user_id', ...) adicional.
    const { error } = await orgTable(ctx, 'fanvue_connections').update({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        token_expires_at: tokens.expiresAt,
        scopes: tokens.scopes,
        updated_at: new Date().toISOString(),
    })
    if (error) throw new Error(error.message)
}

// Refresh the access token slightly before it actually expires.
const EXPIRY_SKEW_MS = 60 * 1000

// In-process, per-ORG serialization of refreshes so the single-use rotating
// refresh token is never sent twice at once. Concurrent callers (mismo o
// distinto usuario, misma org) comparten la misma promesa de refresh en curso.
const refreshLocks = new Map<string, Promise<FanvueTokens>>()

async function doRefresh(
    userId: string,
    refreshToken: string,
): Promise<FanvueTokens> {
    const tokens = await refreshTokens({ refreshToken })
    // Persist the rotated refresh token + new expiry BEFORE the access token is used.
    await persistTokens(userId, tokens)
    return tokens
}

/**
 * Return a currently-valid access token for the user, refreshing (once,
 * serialized) if it is missing/expired or `force` is set. Throws if the
 * user's org has no connection.
 */
export async function getValidAccessToken(
    userId: string,
    opts?: { force?: boolean },
): Promise<string> {
    const connection = await loadConnection(userId)
    if (!connection || !connection.refreshToken) {
        throw new Error(
            'No Fanvue connection for this user — connect the agency first',
        )
    }

    const notExpired =
        !!connection.tokenExpiresAt &&
        Date.now() <
            new Date(connection.tokenExpiresAt).getTime() - EXPIRY_SKEW_MS
    if (!opts?.force && connection.accessToken && notExpired) {
        return connection.accessToken
    }

    // El mutex se indexa por ORG, no por userId: la conexión (y su refresh
    // token rotativo) es de la org, así que dos usuarios de la MISMA org
    // refrescando a la vez tienen que compartir el mismo candado o el
    // segundo consumiría un refresh token ya gastado por el primero.
    const ctx = await getOrgContextForUser(userId)
    if (!ctx) throw new Error('No organization membership for this user')
    const lockKey = ctx.organizationId

    let inflight = refreshLocks.get(lockKey)
    if (!inflight) {
        inflight = doRefresh(userId, connection.refreshToken).finally(() => {
            refreshLocks.delete(lockKey)
        })
        refreshLocks.set(lockKey, inflight)
    }
    const tokens = await inflight
    return tokens.accessToken
}
