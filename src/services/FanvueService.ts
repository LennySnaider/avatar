'use server'

/**
 * Server actions for the Fanvue publishing integration (AGENCY multi-creator).
 *
 * SEPARATE from SocialService.ts (Upload-Post) — do not cross-wire the two.
 * F4.2.f: las tablas tenant (fanvue_connections, fanvue_creators,
 * fanvue_posts) pasan por `orgTable`/`orgInsert`/`orgUpsert` — mismo patrón
 * que SocialService.ts (commit acab85d).
 *
 * F4.2 Tarea 4: `generations` (que quedó fuera de la tarea anterior) entra
 * también. Se autorizaba con `if (g.user_id && g.user_id !== userId)` después
 * de leer por `.in('id', …)`, y ese chequeo se salta ENTERO cuando `user_id`
 * es null — que es el caso de casi todas las filas anteriores al multitenant.
 * Ahora el filtro va DENTRO de la consulta (`orgTable`), donde no se puede
 * saltar. OAuth tokens never reach the client.
 */
import { FanvueClient } from '@/lib/fanvue/FanvueClient'
import { uploadGenerationMedia } from '@/lib/fanvue/mediaUpload'
import { indexKnowledgeSource } from '@/lib/agent/indexer'
import { getOrgContext, type OrgContext } from '@/lib/tenant/getOrgContext'
import { orgTable, orgInsert, orgUpsert } from '@/lib/org/orgTable'
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
import { getValidAccessToken, loadConnection } from '@/lib/fanvue/tokenStore'
import type {
    CreatePostInput,
    FanvueMediaType,
    FanvuePostAudience,
    UpdatePostInput,
} from '@/lib/fanvue/types'
import { getRowMediaUrl } from '@/lib/storagePaths'
import type { MediaType } from '@/@types/supabase'

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
    /**
     * Cover thumbnail — resolved from the cover generation's storage path in
     * `listFanvuePosts` (the row itself only stores `generation_id`). Present
     * only on list results; `null` if the generation was deleted.
     */
    cover_url?: string | null
    cover_media_type?: MediaType | null
}

export interface UpdateFanvuePostInput {
    postId: string
    /** New caption. `null`/empty clears it. Omit to leave unchanged. */
    caption?: string | null
    audience?: FanvuePostAudience
    /** Cents (≥300), or `null`/0 for free. Omit to leave unchanged. */
    price?: number | null
    /** New schedule (ISO). `null` to publish immediately. Omit to leave unchanged. */
    publishAt?: string | null
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
        const ctx = await getOrgContext()
        // La conexion es de la ORG (unique(organization_id) desde la
        // migracion 4.1, ver tokenStore.ts) — orgTable ya acota por ahi, sin
        // filtro adicional por user_id.
        const { data, error } = await orgTable(ctx, 'fanvue_connections')
            .select(
                'scopes, fanvue_account_uuid, refresh_token, created_at, updated_at',
            )
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
        const ctx = await getOrgContext()
        const connection = await loadConnection(ctx.userId)
        if (!connection) return { success: true, data: [] }
        const { data, error } = await orgTable(ctx, 'fanvue_creators')
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
        await getOrgContext()
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
        const ctx = await getOrgContext()
        const connection = await loadConnection(ctx.userId)
        if (!connection)
            return { success: false, error: 'Connect your Fanvue agency first' }

        const client = makeClient(ctx.userId)
        const creators = await client.listAllCreators()

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
            // orgUpsert inyecta organization_id por fila; el onConflict NO se
            // toca (fanvue_creators_connection_creator_key ya es el unique
            // correcto para esta tabla, distinto del problema de
            // fanvue_connections — ver tokenStore.ts).
            const { error } = await orgUpsert(ctx, 'fanvue_creators', rows, {
                onConflict: 'connection_id,creator_user_uuid',
            })
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
    let ctx: OrgContext
    try {
        ctx = await getOrgContext()
    } catch (e) {
        return fail(e)
    }
    const userId = ctx.userId

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
            const { data: creator, error: creatorErr } = await orgTable(
                ctx,
                'fanvue_creators',
            )
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
        // F4.2 Tarea 4: la autorizacion es el filtro de org de la CONSULTA, no
        // un `if` posterior. El `if (g.user_id && g.user_id !== userId)` que
        // habia aqui se saltaba ENTERO cuando `user_id` era null (casi todas
        // las filas anteriores al multitenant), asi que se podia publicar en
        // Fanvue media de otra org con solo pasar su id. Lo que no es de la org
        // ya no vuelve de la consulta y cae en el "Generation not found".
        const requestedIds = [
            input.generationId,
            ...(input.generationIds ?? []),
        ].filter((id, i, arr) => Boolean(id) && arr.indexOf(id) === i)
        const { data: gens, error: genErr } = await orgTable(ctx, 'generations')
            .select('id, media_type, storage_path, avatar_id')
            .in('id', requestedIds)
        if (genErr) throw new Error(genErr.message)
        if (!gens || gens.length !== requestedIds.length) {
            return { success: false, error: 'Generation not found' }
        }
        // orgTable devuelve el builder sin tipar (ver orgTable.ts); el cast va
        // aqui, despues del guard.
        const genRows = gens as {
            id: string
            media_type: string
            storage_path: string
            avatar_id: string | null
        }[]
        const genById = new Map(genRows.map((g) => [g.id, g]))
        const orderedGens = requestedIds.map((id) => genById.get(id)!)
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
        const { data: row, error: insErr } = await orgInsert(
            ctx,
            'fanvue_posts',
            {
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
            },
        )
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
            const organizationId = ctx.organizationId
            const postId = (row as FanvuePostRow).id
            void (async () => {
                try {
                    await indexKnowledgeSource({
                        organizationId,
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
            await orgInsert(ctx, 'fanvue_posts', {
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

const POST_COLUMNS =
    'id, creator_user_uuid, generation_id, caption, audience, price, media_uuids, fanvue_post_uuid, status, scheduled_at, published_at, error_message, created_at'

/** Post history for the org (most recent first), with cover thumbnails. */
export async function listFanvuePosts(): Promise<
    FanvueResult<FanvuePostRow[]>
> {
    try {
        const ctx = await getOrgContext()
        // fanvue_posts es org-wide (user_id es "quien lo creo", no frontera de
        // tenant — mismo criterio que SocialService.listSocialPosts): cualquier
        // miembro de la org ve el historial completo, no solo lo suyo.
        const { data, error } = await orgTable(ctx, 'fanvue_posts')
            .select(POST_COLUMNS)
            .order('created_at', { ascending: false })
            .limit(100)
        if (error) throw new Error(error.message)
        const rows = (data ?? []) as FanvuePostRow[]

        // Resolve each post's cover thumbnail. The row only stores the cover
        // `generation_id`; the actual image lives in `generations.storage_path`.
        // Escaneada por organization_id (no por user_id): si no, las miniaturas
        // de posts creados por un companero de la org saldrian en blanco ahora
        // que el historial de arriba ya es org-wide.
        const genIds = Array.from(
            new Set(
                rows
                    .map((r) => r.generation_id)
                    .filter((id): id is string => Boolean(id)),
            ),
        )
        if (genIds.length > 0) {
            // storage_provider en el select: sin el, getStoragePublicUrl
            // asumia SIEMPRE Supabase y las portadas de generaciones r2
            // (todas, hoy) salian con URL muerta — ya van tres incidentes
            // de este mismo olvido, ver storagePaths.ts.
            const { data: gens } = await orgTable(ctx, 'generations')
                .select('id, storage_path, storage_provider, media_type')
                .in('id', genIds)
            const genRows = (gens ?? []) as {
                id: string
                storage_path: string
                storage_provider: string | null
                media_type: string | null
            }[]
            const coverById = new Map(
                genRows.map(
                    (g): [string, { url: string; mediaType: MediaType | null }] => [
                        g.id,
                        {
                            url: getRowMediaUrl({
                                storage_path: g.storage_path,
                                storage_provider: g.storage_provider,
                            }),
                            mediaType: (g.media_type ?? null) as MediaType | null,
                        },
                    ],
                ),
            )
            for (const r of rows) {
                const cover = r.generation_id
                    ? coverById.get(r.generation_id)
                    : undefined
                r.cover_url = cover?.url ?? null
                r.cover_media_type = cover?.mediaType ?? null
            }
        }
        return { success: true, data: rows }
    } catch (e) {
        return fail(e)
    }
}

/**
 * Edit a tracked Fanvue post. Pushes the change to Fanvue (PATCH) when the
 * post exists there, then mirrors it locally. Only fields present in `input`
 * are touched — everything else is left as-is on both sides.
 */
export async function updateFanvuePost(
    input: UpdateFanvuePostInput,
): Promise<FanvueResult<FanvuePostRow>> {
    try {
        const ctx = await getOrgContext()
        const userId = ctx.userId

        // Org-wide, no user_id: cualquier miembro de la org puede editar el
        // historial de posts (mismo criterio que listFanvuePosts arriba).
        const { data: existing, error: exErr } = await orgTable(
            ctx,
            'fanvue_posts',
        )
            .select('id, creator_user_uuid, fanvue_post_uuid, status')
            .eq('id', input.postId)
            .maybeSingle()
        if (exErr) throw new Error(exErr.message)
        if (!existing) return { success: false, error: 'Post not found' }

        if (input.audience && !VALID_AUDIENCES.has(input.audience)) {
            return { success: false, error: 'Invalid audience' }
        }
        // Fanvue's paid floor is 300 cents; 0/null means free.
        if (
            input.price !== undefined &&
            input.price !== null &&
            input.price > 0 &&
            input.price < 300
        ) {
            return { success: false, error: 'Minimum price is 300 cents ($3.00)' }
        }

        // Normalise once so Fanvue and the local mirror agree.
        const normPrice =
            input.price !== undefined
                ? input.price && input.price > 0
                    ? input.price
                    : null
                : undefined
        const normCaption =
            input.caption !== undefined
                ? input.caption?.trim()
                    ? input.caption
                    : null
                : undefined

        // Push to Fanvue only if the post actually made it there (a 'failed'
        // record has no uuid — we can still fix its local fields for a retry).
        if (existing.fanvue_post_uuid) {
            const body: UpdatePostInput = {}
            if (normCaption !== undefined) body.text = normCaption
            if (input.audience !== undefined) body.audience = input.audience
            if (normPrice !== undefined) body.price = normPrice
            if (input.publishAt !== undefined) body.publishAt = input.publishAt
            if (Object.keys(body).length > 0) {
                const client = makeClient(userId)
                await client.updateCreatorPost(
                    existing.creator_user_uuid,
                    existing.fanvue_post_uuid,
                    body,
                )
            }
        }

        // Mirror locally.
        const patch: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
        }
        if (normCaption !== undefined) patch.caption = normCaption
        if (input.audience !== undefined) patch.audience = input.audience
        if (normPrice !== undefined) patch.price = normPrice
        if (input.publishAt !== undefined) {
            patch.scheduled_at = input.publishAt ?? null
        }
        const { data: row, error: updErr } = await orgTable(
            ctx,
            'fanvue_posts',
        )
            .update(patch)
            .eq('id', input.postId)
            .select(POST_COLUMNS)
            .single()
        if (updErr) throw new Error(updErr.message)
        return { success: true, data: row as FanvuePostRow }
    } catch (e) {
        return fail(e)
    }
}

/**
 * Delete a tracked Fanvue post. Soft-deletes it on Fanvue first (idempotent —
 * a 404 there is fine), then removes the local tracking row so it leaves the
 * history. A 'failed' record (never published) is just removed locally.
 */
export async function deleteFanvuePost(
    postId: string,
): Promise<FanvueResult<{ id: string }>> {
    try {
        const ctx = await getOrgContext()
        // Org-wide, no user_id — mismo criterio que updateFanvuePost.
        const { data: existing, error: exErr } = await orgTable(
            ctx,
            'fanvue_posts',
        )
            .select('id, creator_user_uuid, fanvue_post_uuid')
            .eq('id', postId)
            .maybeSingle()
        if (exErr) throw new Error(exErr.message)
        if (!existing) return { success: false, error: 'Post not found' }

        if (existing.fanvue_post_uuid) {
            const client = makeClient(ctx.userId)
            await client.deleteCreatorPost(
                existing.creator_user_uuid,
                existing.fanvue_post_uuid,
            )
        }

        const { error: delErr } = await orgTable(ctx, 'fanvue_posts')
            .delete()
            .eq('id', postId)
        if (delErr) throw new Error(delErr.message)
        return { success: true, data: { id: postId } }
    } catch (e) {
        return fail(e)
    }
}

/** Tope de la API por llamada al adjuntar media a una carpeta. */
const VAULT_ATTACH_CHUNK = 100

/**
 * Manda generaciones a la BÓVEDA de Fanvue (no las publica).
 *
 * Comparte los tres primeros pasos con `createFanvuePost` —conexión, permiso
 * sobre el creator, propiedad de la media y subida— y solo diverge en el
 * último: en vez de crear un post, adjunta los uuids a una carpeta. Es la
 * misma media en la cuenta de Fanvue; la bóveda es dónde vive, no otra copia.
 *
 * La carpeta se identifica por NOMBRE. Se intenta crear siempre y un 409 se
 * trata como éxito: "ya existe" es justo el estado que se buscaba.
 */
export async function sendGenerationsToFanvueVault(input: {
    generationIds: string[]
    creatorUserUuid?: string | null
    folderName: string
}): Promise<FanvueResult<{ sent: number; folderName: string }>> {
    let ctx: OrgContext
    try {
        ctx = await getOrgContext()
    } catch (e) {
        return fail(e)
    }
    const userId = ctx.userId

    const folderName = input.folderName.trim()
    if (!folderName) {
        return { success: false, error: 'Pick a vault folder name' }
    }
    if (folderName.length > 255) {
        return { success: false, error: 'Folder name is too long (max 255)' }
    }

    const ids = input.generationIds.filter(
        (id, i, arr) => Boolean(id) && arr.indexOf(id) === i,
    )
    if (ids.length === 0) {
        return { success: false, error: 'Select at least one item' }
    }

    try {
        const connection = await loadConnection(userId)
        if (!connection)
            return { success: false, error: 'Connect your Fanvue agency first' }

        // Mismo control que al publicar: en modo agencia el creator tiene que
        // estar gestionado por ESTA conexión.
        if (input.creatorUserUuid) {
            const { data: creator, error: creatorErr } = await orgTable(
                ctx,
                'fanvue_creators',
            )
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

        // Mismo cierre que en createFanvuePost: el filtro de org va en la
        // consulta (el `if` por user_id no autorizaba nada con user_id null).
        const { data: gens, error: genErr } = await orgTable(ctx, 'generations')
            .select('id, media_type, storage_path, metadata')
            .in('id', ids)
        if (genErr) throw new Error(genErr.message)
        if (!gens || gens.length !== ids.length) {
            return { success: false, error: 'Generation not found' }
        }
        const genRows = gens as {
            id: string
            media_type: string
            storage_path: string
            metadata: Record<string, unknown> | null
        }[]

        const client = makeClient(userId)
        const creatorUuid = input.creatorUserUuid ?? null

        // La carpeta ANTES de subir: si el nombre es inválido o falta scope,
        // se falla sin haber gastado una subida por cada imagen.
        await client.createVaultFolder(creatorUuid, folderName)

        const byId = new Map(genRows.map((g) => [g.id, g]))
        const mediaUuids: string[] = []
        for (const id of ids) {
            const g = byId.get(id)!
            mediaUuids.push(
                await uploadGenerationMedia({
                    client,
                    creatorUuid,
                    storagePath: g.storage_path,
                    mediaType: mapMediaType(g.media_type),
                }),
            )
        }

        for (let i = 0; i < mediaUuids.length; i += VAULT_ATTACH_CHUNK) {
            await client.attachMediaToVaultFolder(
                creatorUuid,
                folderName,
                mediaUuids.slice(i, i + VAULT_ATTACH_CHUNK),
            )
        }

        // MARCAR + ARCHIVAR. El envio no deja rastro en Fanvue que podamos
        // consultar barato, asi que el rastro lo llevamos nosotros: sin el, la
        // unica forma de saber si una imagen ya se mando es acordarse — y a
        // 1000 generaciones eso significa reenviar duplicados a la boveda.
        //
        // Se hace DESPUES del attach: marcar antes dejaria imagenes "enviadas"
        // que no llegaron. Y va fila por fila porque `metadata` es un jsonb que
        // hay que FUSIONAR: escribir el objeto entero borraria favorite,
        // nsfw y lo que haya puesto el usuario.
        const sentAt = new Date().toISOString()
        for (const g of genRows) {
            const prev = (g.metadata ?? {}) as Record<string, unknown>
            const { error: markError } = await orgTable(ctx, 'generations')
                .update({
                    metadata: {
                        ...prev,
                        // Archivar la saca de la vista principal: ya cumplio su
                        // proposito y estorba entre las candidatas.
                        archived: true,
                        fanvueVault: {
                            folderName,
                            creatorUuid: creatorUuid ?? null,
                            sentAt,
                        },
                    },
                })
                .eq('id', g.id)
            if (markError) {
                // La media YA esta en la boveda: fallar aqui la reportaria como
                // no enviada y provocaria justo el duplicado que esto evita.
                console.error('[fanvue/vault] no se pudo marcar la generacion:', markError.message)
            }
        }

        return {
            success: true,
            data: { sent: mediaUuids.length, folderName },
        }
    } catch (e) {
        return fail(e)
    }
}

/** Carpetas de la bóveda, para ofrecerlas en vez de pedir el nombre a ciegas. */
export async function listFanvueVaultFolders(
    creatorUserUuid?: string | null,
): Promise<FanvueResult<{ name: string; mediaCount: number }[]>> {
    let userId: string
    try {
        userId = (await getOrgContext()).userId
    } catch (e) {
        return fail(e)
    }
    try {
        const connection = await loadConnection(userId)
        if (!connection)
            return { success: false, error: 'Connect your Fanvue agency first' }
        const res = await makeClient(userId).listVaultFolders(
            creatorUserUuid ?? null,
            { size: 50 },
        )
        return {
            success: true,
            data: (res.data ?? []).map((f) => ({
                name: f.name,
                mediaCount: f.mediaCount,
            })),
        }
    } catch (e) {
        return fail(e)
    }
}
