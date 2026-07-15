'use server'

/**
 * Server actions for the Fanvue publishing integration (AGENCY multi-creator).
 *
 * SEPARATE from SocialService.ts (Upload-Post) — do not cross-wire the two.
 * All DB access uses the service-role client via `fanvueSupabase()`; OAuth
 * tokens never reach the client. Mirrors SocialService's `fail()` /
 * `requireSession()` conventions.
 */
import { requireUserId } from '@/lib/session'
import { FanvueClient } from '@/lib/fanvue/FanvueClient'
import { uploadGenerationMedia } from '@/lib/fanvue/mediaUpload'
import { indexKnowledgeSource } from '@/lib/agent/indexer'
import { getOrgContextForUser } from '@/lib/tenant/getOrgContext'
import {
    buildAuthorizeUrl,
    FANVUE_API_BASE,
    FANVUE_API_VERSION,
    FANVUE_STATE_COOKIE,
} from '@/lib/fanvue/oauth'
import {
    generateCodeChallenge,
    generateCodeVerifier,
    generateState,
    signPayload,
} from '@/lib/fanvue/pkce'
import {
    fanvueSupabase,
    getValidAccessToken,
    loadConnection,
} from '@/lib/fanvue/tokenStore'
import type {
    CreatePostInput,
    FanvueMediaType,
    FanvuePostAudience,
} from '@/lib/fanvue/types'

export interface FanvueResult<T> {
    success: boolean
    data?: T
    error?: string
}

/** Connection status — never carries token values. */
export interface FanvueConnectionSummary {
    connected: boolean
    fanvue_account_uuid: string | null
    scopes: string[] | null
    created_at: string | null
    updated_at: string | null
}

export interface FanvueCreatorRow {
    id: string
    creator_user_uuid: string
    display_name: string | null
    handle: string | null
    avatar_url: string | null
    updated_at: string | null
}

export interface FanvuePostRow {
    id: string
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
}

export interface CreateFanvuePostInput {
    /** Managed-creator UUID (agency mode). Omit to publish to your own account. */
    creatorUserUuid?: string
    /** Cover media. Additional media go in `generationIds` for a gallery post. */
    generationId: string
    /** Extra media (besides `generationId`) for a multi-media gallery post. */
    generationIds?: string[]
    caption?: string
    audience: FanvuePostAudience
    price?: number
    publishAt?: string | null
}

export interface FanvueConnectInit {
    authorizeUrl: string
    /** The connect route sets this on its redirect response (see route). */
    stateCookie: { name: string; value: string; maxAge: number }
}

const STATE_COOKIE_TTL_SECONDS = 600

const VALID_AUDIENCES: ReadonlySet<string> = new Set<FanvuePostAudience>([
    'subscribers',
    'followers-and-subscribers',
])

const fail = (e: unknown): { success: false; error: string } => ({
    success: false,
    error: e instanceof Error ? e.message : String(e),
})

const requireSession = requireUserId

function makeClient(userId: string): FanvueClient {
    return new FanvueClient({
        getAccessToken: (opts) => getValidAccessToken(userId, opts),
        apiBase: FANVUE_API_BASE,
        apiVersion: FANVUE_API_VERSION,
    })
}

/** Connection status for the current user (safe fields only). */
export async function getFanvueConnection(): Promise<
    FanvueResult<FanvueConnectionSummary>
> {
    try {
        const userId = await requireSession()
        const supabase = fanvueSupabase()
        const { data, error } = await supabase
            .from('fanvue_connections')
            .select(
                'scopes, fanvue_account_uuid, refresh_token, created_at, updated_at',
            )
            .eq('user_id', userId)
            .maybeSingle()
        if (error) throw new Error(error.message)
        return {
            success: true,
            data: {
                connected: !!data?.refresh_token,
                fanvue_account_uuid: data?.fanvue_account_uuid ?? null,
                scopes: data?.scopes ?? null,
                created_at: data?.created_at ?? null,
                updated_at: data?.updated_at ?? null,
            },
        }
    } catch (e) {
        return fail(e)
    }
}

/** Cached managed creators for the current user's connection. */
export async function listFanvueCreators(): Promise<
    FanvueResult<FanvueCreatorRow[]>
> {
    try {
        const userId = await requireSession()
        const supabase = fanvueSupabase()
        const connection = await loadConnection(userId)
        if (!connection) return { success: true, data: [] }
        const { data, error } = await supabase
            .from('fanvue_creators')
            .select(
                'id, creator_user_uuid, display_name, handle, avatar_url, updated_at',
            )
            .eq('connection_id', connection.id)
            .order('display_name', { ascending: true })
        if (error) throw new Error(error.message)
        return { success: true, data: (data ?? []) as FanvueCreatorRow[] }
    } catch (e) {
        return fail(e)
    }
}

/**
 * Start the OAuth (PKCE, S256) connect flow: generate state + verifier, build
 * the authorize URL, and return a signed, httpOnly state cookie for the connect
 * route to attach to its redirect response.
 */
export async function generateFanvueConnectUrl(): Promise<
    FanvueResult<FanvueConnectInit>
> {
    try {
        await requireSession()
        if (!process.env.FANVUE_CLIENT_ID) {
            return {
                success: false,
                error: 'FANVUE_CLIENT_ID is not configured',
            }
        }
        const state = generateState()
        const codeVerifier = generateCodeVerifier()
        const codeChallenge = generateCodeChallenge(codeVerifier)
        const authorizeUrl = buildAuthorizeUrl({ state, codeChallenge })

        const payload = Buffer.from(
            JSON.stringify({ state, codeVerifier }),
        ).toString('base64url')
        const signed = signPayload(payload)

        return {
            success: true,
            data: {
                authorizeUrl,
                stateCookie: {
                    name: FANVUE_STATE_COOKIE,
                    value: signed,
                    maxAge: STATE_COOKIE_TTL_SECONDS,
                },
            },
        }
    } catch (e) {
        return fail(e)
    }
}

/** Fetch the agency's managed creators from Fanvue and upsert the local cache. */
export async function syncCreators(): Promise<
    FanvueResult<FanvueCreatorRow[]>
> {
    try {
        const userId = await requireSession()
        const connection = await loadConnection(userId)
        if (!connection)
            return { success: false, error: 'Connect your Fanvue agency first' }

        const client = makeClient(userId)
        const creators = await client.listAllCreators()

        const supabase = fanvueSupabase()
        const nowIso = new Date().toISOString()
        if (creators.length > 0) {
            const rows = creators.map((c) => ({
                connection_id: connection.id,
                creator_user_uuid: c.uuid,
                display_name: c.displayName ?? null,
                handle: c.handle ?? null,
                avatar_url: c.avatarUrl ?? null,
                updated_at: nowIso,
            }))
            const { error } = await supabase
                .from('fanvue_creators')
                .upsert(rows, { onConflict: 'connection_id,creator_user_uuid' })
            if (error) throw new Error(error.message)
        }

        return listFanvueCreators()
    } catch (e) {
        return fail(e)
    }
}

function mapMediaType(mediaType: string): FanvueMediaType {
    return mediaType === 'VIDEO' ? 'video' : 'image'
}

/**
 * Publish a gallery generation to Fanvue for one managed creator: verify
 * ownership + creator authorization, upload the media, create the post, and
 * record it in fanvue_posts.
 */
export async function createFanvuePost(
    input: CreateFanvuePostInput,
): Promise<FanvueResult<FanvuePostRow>> {
    let userId: string
    try {
        userId = await requireSession()
    } catch (e) {
        return fail(e)
    }

    const supabase = fanvueSupabase()

    try {
        // Connection must exist.
        const connection = await loadConnection(userId)
        if (!connection)
            return { success: false, error: 'Connect your Fanvue agency first' }

        // Validate audience.
        if (!VALID_AUDIENCES.has(input.audience)) {
            return {
                success: false,
                error: `Invalid audience: ${input.audience}`,
            }
        }

        // Validate optional price (integer cents, min 300; requires media, which we always have).
        if (input.price !== undefined && input.price !== null) {
            if (!Number.isInteger(input.price) || input.price < 300) {
                return {
                    success: false,
                    error: 'Price must be an integer of at least 300 cents',
                }
            }
        }

        // Authorization (agency mode only): the creator must be managed by
        // THIS connection. In self mode (no creatorUserUuid) we post to the
        // authenticated account, so there is nothing to authorize here.
        if (input.creatorUserUuid) {
            const { data: creator, error: creatorErr } = await supabase
                .from('fanvue_creators')
                .select('creator_user_uuid')
                .eq('connection_id', connection.id)
                .eq('creator_user_uuid', input.creatorUserUuid)
                .maybeSingle()
            if (creatorErr) throw new Error(creatorErr.message)
            if (!creator) {
                return {
                    success: false,
                    error: 'That creator is not managed by your Fanvue agency',
                }
            }
        }

        // Resolve generation(s) + verify ownership. A single id posts as-is;
        // multiple ids form a multi-media gallery (input order preserved, the
        // cover first).
        const requestedIds = [
            input.generationId,
            ...(input.generationIds ?? []),
        ].filter((id, i, arr) => Boolean(id) && arr.indexOf(id) === i)
        const { data: gens, error: genErr } = await supabase
            .from('generations')
            .select('id, media_type, storage_path, user_id, avatar_id')
            .in('id', requestedIds)
        if (genErr) throw new Error(genErr.message)
        if (!gens || gens.length !== requestedIds.length) {
            return { success: false, error: 'Generation not found' }
        }
        const genById = new Map(gens.map((g) => [g.id, g]))
        const orderedGens = requestedIds.map((id) => genById.get(id)!)
        for (const g of orderedGens) {
            if (g.user_id && g.user_id !== userId) {
                return { success: false, error: 'Not your media' }
            }
        }
        const coverGen = orderedGens[0]

        // Upload each media → create one post carrying all of them.
        const client = makeClient(userId)
        const mediaUuids: string[] = []
        for (const g of orderedGens) {
            const uuid = await uploadGenerationMedia({
                client,
                creatorUuid: input.creatorUserUuid ?? null,
                storagePath: g.storage_path,
                mediaType: mapMediaType(g.media_type),
                supabase: supabase as unknown as Parameters<
                    typeof uploadGenerationMedia
                >[0]['supabase'],
            })
            mediaUuids.push(uuid)
        }

        const postBody: CreatePostInput = {
            audience: input.audience,
            text: input.caption?.trim() ? input.caption : undefined,
            mediaUuids,
            ...(input.price !== undefined && input.price !== null
                ? { price: input.price }
                : {}),
            ...(input.publishAt ? { publishAt: input.publishAt } : {}),
        }
        const post = await client.createCreatorPost(
            input.creatorUserUuid ?? null,
            postBody,
        )

        const status = post.publishAt ? 'scheduled' : 'published'
        const { data: row, error: insErr } = await supabase
            .from('fanvue_posts')
            .insert({
                user_id: userId,
                creator_user_uuid: input.creatorUserUuid ?? null,
                generation_id: coverGen.id,
                caption: input.caption ?? null,
                audience: input.audience,
                price: input.price ?? null,
                media_uuids: mediaUuids,
                fanvue_post_uuid: post.uuid,
                status,
                scheduled_at: post.publishAt,
                published_at: post.publishedAt,
                updated_at: new Date().toISOString(),
            })
            .select(
                'id, creator_user_uuid, generation_id, caption, audience, price, media_uuids, fanvue_post_uuid, status, scheduled_at, published_at, error_message, created_at',
            )
            .single()
        if (insErr) throw new Error(insErr.message)

        // Agent RAG hook: Fanvue captions become avatar knowledge —
        // fire-and-forget, must never affect the publish result.
        if (input.caption?.trim() && coverGen.avatar_id) {
            const caption = input.caption
            const avatarId = coverGen.avatar_id
            const postId = (row as FanvuePostRow).id
            void (async () => {
                try {
                    const orgCtx = await getOrgContextForUser(userId)
                    if (!orgCtx) return
                    await indexKnowledgeSource({
                        organizationId: orgCtx.organizationId,
                        avatarId,
                        kind: 'post',
                        title: 'Fanvue post',
                        content: caption,
                        sourceRef: `fanvue_posts:${postId}`,
                    })
                } catch (e) {
                    console.warn('[FanvueService] knowledge index hook failed (non-fatal)', e)
                }
            })()
        }

        return { success: true, data: row as FanvuePostRow }
    } catch (e) {
        // Best-effort failure record so the history surfaces what went wrong;
        // never let this mask the real error.
        const message = e instanceof Error ? e.message : String(e)
        try {
            await supabase.from('fanvue_posts').insert({
                user_id: userId,
                creator_user_uuid: input.creatorUserUuid ?? null,
                generation_id: input.generationId,
                caption: input.caption ?? null,
                audience: input.audience,
                price: input.price ?? null,
                status: 'failed',
                scheduled_at: input.publishAt ?? null,
                error_message: message,
                updated_at: new Date().toISOString(),
            })
        } catch {
            // ignore — the returned error below is the source of truth
        }
        return { success: false, error: message }
    }
}

/** Post history for the current user (most recent first). */
export async function listFanvuePosts(): Promise<
    FanvueResult<FanvuePostRow[]>
> {
    try {
        const userId = await requireSession()
        const supabase = fanvueSupabase()
        const { data, error } = await supabase
            .from('fanvue_posts')
            .select(
                'id, creator_user_uuid, generation_id, caption, audience, price, media_uuids, fanvue_post_uuid, status, scheduled_at, published_at, error_message, created_at',
            )
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(100)
        if (error) throw new Error(error.message)
        return { success: true, data: (data ?? []) as FanvuePostRow[] }
    } catch (e) {
        return fail(e)
    }
}
