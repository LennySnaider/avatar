/**
 * Persistence + refresh orchestration for the single agency OAuth connection
 * per app user. All access uses the Supabase service-role client; tokens never
 * leave the server.
 *
 * Refresh-token rotation: Fanvue rotates the refresh token on every refresh
 * (single-use, 30s grace). We (a) serialize refreshes per user with an
 * in-process mutex so a token is never spent twice concurrently, and (b)
 * persist the NEW refresh token + expiry BEFORE returning the access token.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase'
import type { Database as BaseDatabase } from '@/@types/supabase'
import { refreshTokens } from './oauth'
import type { FanvueTokens } from './types'

// --- Local Database extension -------------------------------------------------
// `src/@types/supabase.ts` is hand-maintained and does not include the fanvue_*
// tables (their migration lives under supabase/migrations and is applied out of
// band). Extend the base type locally so queries stay fully typed, mirroring how
// SocialService.ts extends it for the social_* tables.

interface FanvueConnectionsTable {
    Row: {
        id: string
        user_id: string
        access_token: string | null
        refresh_token: string | null
        token_expires_at: string | null
        scopes: string[] | null
        fanvue_account_uuid: string | null
        created_at: string
        updated_at: string
    }
    Insert: {
        id?: string
        user_id: string
        access_token?: string | null
        refresh_token?: string | null
        token_expires_at?: string | null
        scopes?: string[] | null
        fanvue_account_uuid?: string | null
        created_at?: string
        updated_at?: string
    }
    Update: {
        id?: string
        user_id?: string
        access_token?: string | null
        refresh_token?: string | null
        token_expires_at?: string | null
        scopes?: string[] | null
        fanvue_account_uuid?: string | null
        created_at?: string
        updated_at?: string
    }
    Relationships: []
}

interface FanvueCreatorsTable {
    Row: {
        id: string
        connection_id: string
        creator_user_uuid: string
        display_name: string | null
        handle: string | null
        avatar_url: string | null
        updated_at: string
    }
    Insert: {
        id?: string
        connection_id: string
        creator_user_uuid: string
        display_name?: string | null
        handle?: string | null
        avatar_url?: string | null
        updated_at?: string
    }
    Update: {
        id?: string
        connection_id?: string
        creator_user_uuid?: string
        display_name?: string | null
        handle?: string | null
        avatar_url?: string | null
        updated_at?: string
    }
    Relationships: []
}

interface FanvuePostsTable {
    Row: {
        id: string
        user_id: string | null
        creator_user_uuid: string | null
        generation_id: string | null
        caption: string | null
        audience: string | null
        price: number | null
        media_uuids: string[] | null
        fanvue_post_uuid: string | null
        status: string | null
        scheduled_at: string | null
        published_at: string | null
        error_message: string | null
        created_at: string
        updated_at: string
    }
    Insert: {
        id?: string
        user_id?: string | null
        creator_user_uuid?: string | null
        generation_id?: string | null
        caption?: string | null
        audience?: string | null
        price?: number | null
        media_uuids?: string[] | null
        fanvue_post_uuid?: string | null
        status?: string | null
        scheduled_at?: string | null
        published_at?: string | null
        error_message?: string | null
        created_at?: string
        updated_at?: string
    }
    Update: {
        id?: string
        user_id?: string | null
        creator_user_uuid?: string | null
        generation_id?: string | null
        caption?: string | null
        audience?: string | null
        price?: number | null
        media_uuids?: string[] | null
        fanvue_post_uuid?: string | null
        status?: string | null
        scheduled_at?: string | null
        published_at?: string | null
        error_message?: string | null
        created_at?: string
        updated_at?: string
    }
    Relationships: []
}

export type FanvueDatabase = BaseDatabase & {
    public: BaseDatabase['public'] & {
        Tables: BaseDatabase['public']['Tables'] & {
            fanvue_connections: FanvueConnectionsTable
            fanvue_creators: FanvueCreatorsTable
            fanvue_posts: FanvuePostsTable
        }
    }
}

/** Service-role client typed to include the fanvue_* tables (see note above). */
export function fanvueSupabase(): SupabaseClient<FanvueDatabase> {
    return createServerSupabaseClient() as unknown as SupabaseClient<FanvueDatabase>
}

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

/** Load the agency connection for a user, or `null` if not connected. */
export async function loadConnection(
    userId: string,
): Promise<FanvueConnectionRecord | null> {
    const supabase = fanvueSupabase()
    const { data, error } = await supabase
        .from('fanvue_connections')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null
    return {
        id: data.id,
        userId: data.user_id,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        tokenExpiresAt: data.token_expires_at,
        scopes: data.scopes,
        fanvueAccountUuid: data.fanvue_account_uuid,
    }
}

/** Create/replace the connection after a successful code exchange. */
export async function upsertConnection(
    userId: string,
    tokens: FanvueTokens,
    fanvueAccountUuid?: string | null,
): Promise<void> {
    const supabase = fanvueSupabase()
    const { error } = await supabase.from('fanvue_connections').upsert(
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
        { onConflict: 'user_id' },
    )
    if (error) throw new Error(error.message)
}

async function persistTokens(
    userId: string,
    tokens: FanvueTokens,
): Promise<void> {
    const supabase = fanvueSupabase()
    const { error } = await supabase
        .from('fanvue_connections')
        .update({
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
            token_expires_at: tokens.expiresAt,
            scopes: tokens.scopes,
            updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
    if (error) throw new Error(error.message)
}

// Refresh the access token slightly before it actually expires.
const EXPIRY_SKEW_MS = 60 * 1000

// In-process, per-user serialization of refreshes so the single-use rotating
// refresh token is never sent twice at once. Concurrent callers share the same
// in-flight refresh promise.
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
 * serialized) if it is missing/expired or `force` is set. Throws if the user
 * has no connection.
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

    let inflight = refreshLocks.get(userId)
    if (!inflight) {
        inflight = doRefresh(userId, connection.refreshToken).finally(() => {
            refreshLocks.delete(userId)
        })
        refreshLocks.set(userId, inflight)
    }
    const tokens = await inflight
    return tokens.accessToken
}
