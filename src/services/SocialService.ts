'use server'

import { requireUserId } from '@/lib/session'
import { createServerSupabaseClient, getStoragePublicUrl } from '@/lib/supabase'
import { getSocialProvider, deriveUploadPostUsername } from '@/lib/social/provider'
import { indexKnowledgeSource } from '@/lib/agent/indexer'
import { getOrgContextForUser } from '@/lib/tenant/getOrgContext'
import { agentSupabase } from '@/lib/agent/db'
import { UploadPostProvider } from '@/lib/social/providers/UploadPostProvider'
import { validatePostForPlatforms } from '@/lib/social/platformValidators'
import { appendHashtagsToCaption } from '@/lib/social/hashtagHelpers'
import { ALL_PLATFORMS } from '@/@types/social'
import type { Platform, PlatformTarget } from '@/@types/social'
import type { PublishResponse, ScheduledPost } from '@/lib/social/providers/SocialProvider'
import type { Database, Json } from '@/@types/supabase'

export interface SocialResult<T> { success: boolean; data?: T; error?: string }

type SocialProfileDbRow = Database['public']['Tables']['social_profiles']['Row']
type SocialPostDbRow = Database['public']['Tables']['social_posts']['Row']

/**
 * Client-safe view of an avatar's Upload-Post account. The raw `api_key`
 * column NEVER leaves the server — only presence flags and the last 4 chars.
 */
export interface SocialProfileSummary {
    id: string
    avatarId: string | null
    uploadPostUsername: string
    status: string
    connectedPlatforms: unknown[]
    lastSyncedAt: string | null
    hasApiKey: boolean
    /** api_key NULL + status 'active' → legacy row running on env UPLOAD_POST_API_KEY. */
    usesEnvKey: boolean
    apiKeyLast4: string | null
}

export interface AvatarSocialAccountRow {
    avatarId: string
    avatarName: string
    profile: SocialProfileSummary | null
}

export interface SocialPostRow {
    id: string
    caption: string
    hashtags: string[]
    content_type: string
    media_urls: string[]
    platforms: unknown
    status: string
    scheduled_at: string | null
    published_at: string | null
    error_message: string | null
    created_at: string
    generation_id: string | null
    avatar_id: string | null
    avatar_name: string | null
}

export interface CreateSocialPostInput {
    /** Avatar whose Upload-Post account publishes this post. */
    avatarId: string
    generationId?: string
    /** Carousel: additional gallery generations (images only). Order = post order. */
    generationIds?: string[]
    caption: string
    hashtags: string[]
    platforms: string[]
    scheduledAt?: string | null
}

const fail = (e: unknown): { success: false; error: string } => ({
    success: false,
    error: e instanceof Error ? e.message : String(e),
})

const requireSession = requireUserId

const VALID_PLATFORMS = new Set<string>(ALL_PLATFORMS)

/** Narrow a plain-object/array value down to the Json type the jsonb columns expect. */
function toJson(value: unknown): Json {
    return value as Json
}

/** Validate raw platform strings from the client against the known Platform union. */
function toValidatedPlatforms(raw: string[]): { platforms: Platform[]; invalid: string[] } {
    const platforms: Platform[] = []
    const invalid: string[] = []
    for (const p of raw) {
        if (VALID_PLATFORMS.has(p)) platforms.push(p as Platform)
        else invalid.push(p)
    }
    return { platforms, invalid }
}

function toSummary(row: SocialProfileDbRow): SocialProfileSummary {
    const usesEnvKey = !row.api_key && row.status === 'active'
    return {
        id: row.id,
        avatarId: row.avatar_id,
        uploadPostUsername: row.upload_post_username,
        status: row.status,
        connectedPlatforms: Array.isArray(row.connected_platforms)
            ? (row.connected_platforms as unknown[])
            : [],
        lastSyncedAt: row.last_synced_at,
        hasApiKey: Boolean(row.api_key) || usesEnvKey,
        usesEnvKey,
        apiKeyLast4: row.api_key ? row.api_key.slice(-4) : null,
    }
}

/**
 * Resolve which API key a profile row runs on. `null` means "fall back to env
 * UPLOAD_POST_API_KEY" — allowed ONLY while the row is active (the legacy
 * migrated row); a disconnected row without a key has no usable account.
 */
function resolveProfileKey(row: Pick<SocialProfileDbRow, 'api_key' | 'status'>): string | null {
    if (row.api_key) return row.api_key
    if (row.status === 'active') return null
    throw new Error("This avatar's Upload-Post account is disconnected — reconnect it first")
}

function webhookCallbackUrl(): string {
    return `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3030'}/api/webhooks/upload-post`
}

// Canonical Upload-Post event names — must match what `normalizeEventName()`
// in `src/app/api/webhooks/upload-post/route.ts` documents as the provider's
// real event names.
const WEBHOOK_EVENTS = [
    'upload_completed',
    'social_account.connected',
    'social_account.disconnected',
    'social_account.reauth_required',
    'ffmpeg.completed',
]

const SCHEDULE_MATCH_WINDOW_MS = 60 * 1000
const AMBIGUOUS_CANCEL_WINDOW_MS = 10 * 60 * 1000

/** Narrow a `platforms` jsonb value down to a `Set<Platform>` for comparison. */
function toPlatformSet(platforms: Json): Set<Platform> {
    if (!Array.isArray(platforms)) return new Set()
    return new Set(platforms.filter((p): p is Platform => typeof p === 'string') as Platform[])
}

function platformSetsEqual(a: Set<Platform>, b: Set<Platform>): boolean {
    if (a.size === 0 || a.size !== b.size) return false
    for (const platform of a) if (!b.has(platform)) return false
    return true
}

/**
 * Match a locally-known {scheduledAt, platforms} pair against Upload-Post's
 * `listScheduled` results, to recover the `jobId` that `PublishResponse`
 * never carries (see task-3 report addendum).
 *
 * This mirrors the cron's conservative `findScheduledMatch` in
 * `src/app/api/cron/social-reconcile/route.ts` (same rule, duplicated here
 * as a small pure function rather than importing across the route/service
 * boundary): a candidate must have (a) `scheduledAt` within 60 seconds of
 * ours, (b) an EXACT (non-empty) platform-set match, and (c) be the ONLY
 * candidate satisfying both — otherwise this refuses to guess and returns
 * `null`. The previous caption/title-prefix + 2-minute-window heuristic
 * ignored platforms entirely and used `.find()` (first match, no ambiguity
 * check), which could correlate to the WRONG provider job; since callers
 * use the result to cancel that job, a wrong match cancels someone else's
 * post instead of this one.
 */
function findMatchingScheduledJob(
    jobs: ScheduledPost[],
    targetScheduledAt: string | Date,
    platforms: Json,
): ScheduledPost | null {
    const targetMs = new Date(targetScheduledAt).getTime()
    if (Number.isNaN(targetMs)) return null
    const targetPlatforms = toPlatformSet(platforms)
    if (targetPlatforms.size === 0) return null

    const candidates = jobs.filter((job) => {
        const jobMs = new Date(job.scheduledAt).getTime()
        if (Number.isNaN(jobMs) || Math.abs(jobMs - targetMs) > SCHEDULE_MATCH_WINDOW_MS) return false
        return platformSetsEqual(targetPlatforms, new Set(job.platforms))
    })

    return candidates.length === 1 ? candidates[0] : null
}

type SupabaseServerClient = ReturnType<typeof createServerSupabaseClient>

/** Fetch an avatar row and assert the session user owns it. */
async function getOwnedAvatar(
    supabase: SupabaseServerClient,
    avatarId: string,
    userId: string,
): Promise<{ id: string; name: string }> {
    const { data: avatar, error } = await supabase
        .from('avatars')
        .select('id, name, user_id')
        .eq('id', avatarId)
        .maybeSingle()
    if (error) throw new Error(error.message)
    if (!avatar) throw new Error('Avatar not found')
    if (avatar.user_id && avatar.user_id !== userId) throw new Error('Not your avatar')
    return { id: avatar.id, name: avatar.name }
}

/** Resolve avatar id + name for a batch of posts via their social profile. */
async function attachAvatarInfo(
    supabase: SupabaseServerClient,
    rows: SocialPostDbRow[],
): Promise<SocialPostRow[]> {
    const profileIds = [...new Set(rows.map((r) => r.social_profile_id).filter((id): id is string => Boolean(id)))]
    const profileToAvatar = new Map<string, string>()
    const avatarNames = new Map<string, string>()
    if (profileIds.length > 0) {
        const { data: profiles } = await supabase
            .from('social_profiles')
            .select('id, avatar_id')
            .in('id', profileIds)
        for (const p of profiles ?? []) {
            if (p.avatar_id) profileToAvatar.set(p.id, p.avatar_id)
        }
        const avatarIds = [...new Set([...profileToAvatar.values()])]
        if (avatarIds.length > 0) {
            const { data: avatars } = await supabase
                .from('avatars')
                .select('id, name')
                .in('id', avatarIds)
            for (const a of avatars ?? []) avatarNames.set(a.id, a.name)
        }
    }
    return rows.map((row) => {
        const avatarId = row.social_profile_id ? (profileToAvatar.get(row.social_profile_id) ?? null) : null
        return {
            id: row.id,
            caption: row.caption,
            hashtags: row.hashtags,
            content_type: row.content_type,
            media_urls: row.media_urls,
            platforms: row.platforms,
            status: row.status,
            scheduled_at: row.scheduled_at,
            published_at: row.published_at,
            error_message: row.error_message,
            created_at: row.created_at,
            generation_id: row.generation_id,
            avatar_id: avatarId,
            avatar_name: avatarId ? (avatarNames.get(avatarId) ?? null) : null,
        }
    })
}

// ---------------------------------------------------------------------------
// Accounts (per-avatar Upload-Post account management)
// ---------------------------------------------------------------------------

/** All of the user's avatars, each with its Upload-Post account state (or null). */
export async function listAvatarSocialAccounts(): Promise<SocialResult<AvatarSocialAccountRow[]>> {
    try {
        const userId = await requireSession()
        const supabase = createServerSupabaseClient()
        const { data: avatars, error: avErr } = await supabase
            .from('avatars')
            .select('id, name, user_id')
            .order('created_at', { ascending: true })
        if (avErr) throw new Error(avErr.message)
        const mine = (avatars ?? []).filter((a) => !a.user_id || a.user_id === userId)

        const { data: profiles, error: prErr } = await supabase
            .from('social_profiles')
            .select('*')
            .not('avatar_id', 'is', null)
        if (prErr) throw new Error(prErr.message)
        const byAvatar = new Map(
            ((profiles ?? []) as SocialProfileDbRow[]).map((p) => [p.avatar_id as string, p]),
        )

        return {
            success: true,
            data: mine.map((a) => {
                const row = byAvatar.get(a.id)
                return {
                    avatarId: a.id,
                    avatarName: a.name,
                    profile: row ? toSummary(row) : null,
                }
            }),
        }
    } catch (e) {
        return fail(e)
    }
}

/**
 * Connect (or re-key) an avatar's independent Upload-Post account: validate
 * the pasted API key against the Upload-Post API, ensure the sub-user profile
 * exists on that account, persist the key, and best-effort register the
 * webhook + pull the initial connected-accounts snapshot.
 */
export async function connectUploadPostAccount(input: {
    avatarId: string
    apiKey: string
}): Promise<SocialResult<SocialProfileSummary>> {
    try {
        const userId = await requireSession()
        const apiKey = input.apiKey.trim()
        if (!input.avatarId) return { success: false, error: 'Avatar is required' }
        if (!apiKey) return { success: false, error: 'API key is required' }

        const supabase = createServerSupabaseClient()
        const avatar = await getOwnedAvatar(supabase, input.avatarId, userId)

        // Probe the key with a cheap authenticated GET before persisting
        // anything. Throws a mapped "Invalid Upload-Post API key" on 401.
        // Deliberately NOT getSocialProvider(): unvalidated keys must not
        // pollute the provider cache.
        const provider = new UploadPostProvider(apiKey, process.env.UPLOAD_POST_BASE_URL)
        await provider.listProfiles()

        // Reuse the existing row's username (UNIQUE in our DB, and the
        // profile already exists on Upload-Post's side); derive one for new rows.
        const { data: existing } = await supabase
            .from('social_profiles')
            .select('*')
            .eq('avatar_id', input.avatarId)
            .maybeSingle()
        const username = existing?.upload_post_username ?? deriveUploadPostUsername(avatar)

        // Idempotent-ish: Upload-Post "exists" errors are tolerated; a 403
        // (profile limit on that account's plan) surfaces with a clear message.
        try {
            await provider.createProfile(username)
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            if (!/exist/i.test(msg)) throw e
        }

        let row: SocialProfileDbRow
        if (existing) {
            const { data, error } = await supabase
                .from('social_profiles')
                .update({ api_key: apiKey, status: 'active' })
                .eq('id', existing.id)
                .select('*')
                .single()
            if (error) throw new Error(error.message)
            row = data as SocialProfileDbRow
        } else {
            const { data, error } = await supabase
                .from('social_profiles')
                .insert({
                    avatar_id: input.avatarId,
                    upload_post_username: username,
                    api_key: apiKey,
                    status: 'active',
                })
                .select('*')
                .single()
            if (error) throw new Error(error.message)
            row = data as SocialProfileDbRow
        }

        // Best-effort extras — never fail the connect over them.
        try {
            await provider.configureWebhook(username, webhookCallbackUrl(), WEBHOOK_EVENTS)
        } catch (e) {
            console.warn('[SocialService] webhook registration failed (non-fatal)', e)
        }
        try {
            const details = await provider.getProfile(username)
            const { data } = await supabase
                .from('social_profiles')
                .update({
                    connected_platforms: toJson(details.connectedAccounts ?? []),
                    upload_post_metadata: details.metadata ? toJson(details.metadata) : null,
                    last_synced_at: new Date().toISOString(),
                })
                .eq('id', row.id)
                .select('*')
                .single()
            if (data) row = data as SocialProfileDbRow
        } catch (e) {
            console.warn('[SocialService] initial account sync failed (non-fatal)', e)
        }

        return { success: true, data: toSummary(row) }
    } catch (e) {
        return fail(e)
    }
}

/**
 * Soft-disconnect an avatar's account: forget the key locally and mark the
 * row disconnected. The row is kept (post history references it) and the
 * Upload-Post profile is NOT deleted (its connected socials survive a
 * reconnect). Posts already scheduled on Upload-Post will still publish.
 */
export async function disconnectUploadPostAccount(avatarId: string): Promise<SocialResult<SocialProfileSummary>> {
    try {
        const userId = await requireSession()
        const supabase = createServerSupabaseClient()
        await getOwnedAvatar(supabase, avatarId, userId)
        const { data, error } = await supabase
            .from('social_profiles')
            .update({ status: 'disconnected', api_key: null, connected_platforms: toJson([]) })
            .eq('avatar_id', avatarId)
            .select('*')
            .single()
        if (error) throw new Error(error.message)
        return { success: true, data: toSummary(data as SocialProfileDbRow) }
    } catch (e) {
        return fail(e)
    }
}

export async function getSocialProfileAction(avatarId: string): Promise<SocialResult<SocialProfileSummary | null>> {
    try {
        await requireSession()
        if (!avatarId) return { success: true, data: null }
        const supabase = createServerSupabaseClient()
        const { data, error } = await supabase
            .from('social_profiles')
            .select('*')
            .eq('avatar_id', avatarId)
            .maybeSingle()
        if (error) throw new Error(error.message)
        return { success: true, data: data ? toSummary(data as SocialProfileDbRow) : null }
    } catch (e) {
        return fail(e)
    }
}

export async function generateSocialConnectUrl(avatarId: string): Promise<SocialResult<{ accessUrl: string; expiresAt: string | null }>> {
    try {
        const userId = await requireSession()
        const supabase = createServerSupabaseClient()
        const avatar = await getOwnedAvatar(supabase, avatarId, userId)
        const { data: profile } = await supabase
            .from('social_profiles')
            .select('*')
            .eq('avatar_id', avatarId)
            .maybeSingle()
        if (!profile || profile.status !== 'active') {
            return {
                success: false,
                error: 'This avatar has no active Upload-Post account — connect one with its API key first',
            }
        }
        const provider = getSocialProvider(resolveProfileKey(profile as SocialProfileDbRow))
        const redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3030'}/api/social/callback?avatarId=${encodeURIComponent(avatarId)}`
        const res = await provider.generateConnectUrl({
            username: profile.upload_post_username,
            redirectUrl,
            connectTitle: `Connect ${avatar.name}'s accounts`,
        })
        return { success: true, data: { accessUrl: res.accessUrl, expiresAt: res.expiresAt.toISOString() } }
    } catch (e) {
        return fail(e)
    }
}

export async function syncConnectedAccounts(avatarId: string): Promise<SocialResult<SocialProfileSummary>> {
    try {
        await requireSession()
        const supabase = createServerSupabaseClient()
        const { data: profile, error: profErr } = await supabase
            .from('social_profiles')
            .select('*')
            .eq('avatar_id', avatarId)
            .maybeSingle()
        if (profErr) throw new Error(profErr.message)
        if (!profile) return { success: false, error: 'No Upload-Post account for this avatar' }
        const provider = getSocialProvider(resolveProfileKey(profile as SocialProfileDbRow))
        const details = await provider.getProfile(profile.upload_post_username)
        const { data, error } = await supabase
            .from('social_profiles')
            .update({
                connected_platforms: toJson(details.connectedAccounts ?? []),
                upload_post_metadata: details.metadata ? toJson(details.metadata) : null,
                last_synced_at: new Date().toISOString(),
            })
            .eq('id', profile.id)
            .select('*')
            .single()
        if (error) throw new Error(error.message)
        return { success: true, data: toSummary(data as SocialProfileDbRow) }
    } catch (e) {
        return fail(e)
    }
}

export async function registerUploadPostWebhook(avatarId: string): Promise<SocialResult<{ configured: boolean }>> {
    try {
        await requireSession()
        const supabase = createServerSupabaseClient()
        const { data: profile } = await supabase
            .from('social_profiles')
            .select('*')
            .eq('avatar_id', avatarId)
            .maybeSingle()
        if (!profile) return { success: false, error: 'No Upload-Post account for this avatar' }
        const provider = getSocialProvider(resolveProfileKey(profile as SocialProfileDbRow))
        const result = await provider.configureWebhook(
            profile.upload_post_username,
            webhookCallbackUrl(),
            WEBHOOK_EVENTS,
        )
        return { success: true, data: { configured: result.configured } }
    } catch (e) {
        return fail(e)
    }
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

export async function createSocialPost(input: CreateSocialPostInput): Promise<SocialResult<SocialPostRow>> {
    try {
        const userId = await requireSession()
        const supabase = createServerSupabaseClient()

        if (!input.avatarId) {
            return { success: false, error: 'Select an avatar to post as' }
        }
        await getOwnedAvatar(supabase, input.avatarId, userId)

        const { data: profile } = await supabase
            .from('social_profiles')
            .select('*')
            .eq('avatar_id', input.avatarId)
            .eq('status', 'active')
            .maybeSingle()
        if (!profile) {
            return {
                success: false,
                error: 'This avatar has no Upload-Post account — connect one in Social Accounts',
            }
        }
        const username = profile.upload_post_username

        const { platforms, invalid } = toValidatedPlatforms(input.platforms)
        if (invalid.length > 0) return { success: false, error: `Unknown platform(s): ${invalid.join(', ')}` }
        if (platforms.length === 0) return { success: false, error: 'Pick at least one platform' }

        // Resolve media from gallery generations (durable public URLs). A
        // single id posts as-is; multiple ids form a photo carousel (input
        // order preserved).
        const requestedIds = [
            ...(input.generationId ? [input.generationId] : []),
            ...(input.generationIds ?? []),
        ].filter((id, i, arr) => arr.indexOf(id) === i)
        let mediaUrls: string[] = []
        let contentType: 'photo' | 'video' | 'text' = 'text'
        let generationId: string | null = null
        if (requestedIds.length > 0) {
            const { data: gens, error: genErr } = await supabase
                .from('generations')
                .select('id, media_type, storage_path, user_id, avatar_id')
                .in('id', requestedIds)
            if (genErr || !gens || gens.length !== requestedIds.length) {
                return { success: false, error: 'Generation not found' }
            }
            const byId = new Map(gens.map((g) => [g.id, g]))
            const ordered = requestedIds.map((id) => byId.get(id)!)
            for (const gen of ordered) {
                if (gen.user_id && gen.user_id !== userId) return { success: false, error: 'Not your media' }
                // Media generated under another avatar must not go out through
                // this avatar's accounts; avatar-less media (auto-saves) may.
                if (gen.avatar_id && gen.avatar_id !== input.avatarId) {
                    return { success: false, error: 'Media belongs to a different avatar' }
                }
            }
            if (ordered.length > 1 && ordered.some((g) => g.media_type === 'VIDEO')) {
                return { success: false, error: 'Carousels support images only — post videos individually' }
            }
            mediaUrls = ordered.map((g) => getStoragePublicUrl('generations', g.storage_path))
            contentType = ordered[0].media_type === 'VIDEO' ? 'video' : 'photo'
            generationId = ordered[0].id
        }

        const caption = appendHashtagsToCaption(input.caption, input.hashtags)
        const validation = validatePostForPlatforms(caption, platforms, input.hashtags)
        const failures = Object.entries(validation).filter(([, result]) => result && !result.valid)
        if (failures.length > 0) {
            const message = failures
                .map(([platform, result]) => `${platform}: ${result?.errorKey ?? 'invalid'}`)
                .join('; ')
            return { success: false, error: message }
        }

        const provider = getSocialProvider(resolveProfileKey(profile as SocialProfileDbRow))
        const platformTargets: PlatformTarget[] = platforms.map((platform) => ({ platform }))
        const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : undefined
        const publishBase = {
            username,
            caption,
            platforms: platformTargets,
            scheduledAt,
        }

        let dispatch: PublishResponse
        if (contentType === 'video') {
            if (mediaUrls.length === 0) return { success: false, error: 'Video post requires media' }
            dispatch = await provider.publishVideo({ ...publishBase, videoUrl: mediaUrls[0] })
        } else if (contentType === 'photo') {
            if (mediaUrls.length === 0) return { success: false, error: 'Photo post requires media' }
            dispatch = await provider.publishPhoto({ ...publishBase, photoUrls: mediaUrls })
        } else {
            dispatch = await provider.publishText(publishBase)
        }

        // Best-effort backfill: PublishResponse never carries Upload-Post's
        // internal schedule job id, so a scheduled dispatch is otherwise
        // uncancellable on the provider side (see task-3 report addendum).
        // Losing this lookup must never fail the publish that already
        // succeeded above.
        let uploadPostJobId: string | null = null
        if (input.scheduledAt) {
            try {
                const scheduled = await provider.listScheduled(username)
                uploadPostJobId = findMatchingScheduledJob(scheduled, input.scheduledAt, toJson(platforms))?.jobId ?? null
            } catch (e) {
                console.warn('[SocialService] listScheduled backfill failed', e)
            }
        }

        const { data: row, error: insErr } = await supabase
            .from('social_posts')
            .insert({
                social_profile_id: profile.id,
                generation_id: generationId,
                user_id: userId,
                caption,
                hashtags: input.hashtags,
                content_type: contentType,
                media_urls: mediaUrls,
                platforms: toJson(platforms),
                status: input.scheduledAt ? 'scheduled' : 'processing',
                scheduled_at: input.scheduledAt ?? null,
                upload_post_request_id: dispatch.requestId ?? null,
                upload_post_job_id: uploadPostJobId,
                upload_post_response: toJson(dispatch),
            })
            .select('*')
            .single()
        if (insErr) throw new Error(insErr.message)

        // Agent RAG hook: published captions become avatar knowledge —
        // fire-and-forget, must never affect the publish result.
        if (caption.trim() && profile.avatar_id) {
            void (async () => {
                try {
                    const orgCtx = await getOrgContextForUser(userId)
                    if (!orgCtx) return
                    await indexKnowledgeSource({
                        organizationId: orgCtx.organizationId,
                        avatarId: profile.avatar_id as string,
                        kind: 'post',
                        title: 'Social post',
                        content: caption,
                        sourceRef: `social_posts:${row.id}`,
                    })
                } catch (e) {
                    console.warn('[SocialService] knowledge index hook failed (non-fatal)', e)
                }
            })()
        }

        const [enriched] = await attachAvatarInfo(supabase, [row as SocialPostDbRow])
        return { success: true, data: enriched }
    } catch (e) {
        return fail(e)
    }
}

/**
 * generation_id → platforms it was published to (['instagram','x','fanvue']).
 * Drives the "Posted" badge in the gallery. Audio-muxed copies re-attribute to
 * their source generation via metadata.muxedFrom, so the ORIGINAL gallery item
 * shows as posted too.
 */
export async function getPostedGenerationMap(): Promise<SocialResult<Record<string, string[]>>> {
    try {
        const userId = await requireSession()
        const supabase = createServerSupabaseClient()
        const map = new Map<string, Set<string>>()
        const add = (genId: string | null, labels: string[]) => {
            if (!genId || labels.length === 0) return
            const set = map.get(genId) ?? new Set<string>()
            labels.forEach((l) => set.add(l))
            map.set(genId, set)
        }

        const { data: socialPosts } = await supabase
            .from('social_posts')
            .select('generation_id, platforms, status')
            .eq('user_id', userId)
            .not('generation_id', 'is', null)
            .in('status', ['processing', 'scheduled', 'published'])
            .limit(1000)
        for (const post of socialPosts ?? []) {
            add(post.generation_id, [...toPlatformSet(post.platforms)])
        }

        const { data: fanvuePosts } = await agentSupabase()
            .from('fanvue_posts')
            .select('generation_id, status, user_id')
            .eq('user_id', userId)
            .in('status', ['published', 'scheduled'])
            .limit(1000)
        for (const post of fanvuePosts ?? []) {
            add(post.generation_id, ['fanvue'])
        }

        // Re-attribute muxed copies to their original generation.
        const postedIds = [...map.keys()]
        if (postedIds.length > 0) {
            const { data: gens } = await supabase
                .from('generations')
                .select('id, metadata')
                .in('id', postedIds)
            for (const gen of gens ?? []) {
                const muxedFrom = (gen.metadata as { muxedFrom?: unknown } | null)?.muxedFrom
                if (typeof muxedFrom === 'string' && map.has(gen.id)) {
                    add(muxedFrom, [...(map.get(gen.id) ?? [])])
                }
            }
        }

        return {
            success: true,
            data: Object.fromEntries([...map].map(([k, v]) => [k, [...v]])),
        }
    } catch (e) {
        return fail(e)
    }
}

export async function listSocialPosts(): Promise<SocialResult<SocialPostRow[]>> {
    try {
        await requireSession()
        const supabase = createServerSupabaseClient()
        const { data, error } = await supabase
            .from('social_posts')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100)
        if (error) throw new Error(error.message)
        const enriched = await attachAvatarInfo(supabase, (data ?? []) as SocialPostDbRow[])
        return { success: true, data: enriched }
    } catch (e) {
        return fail(e)
    }
}

export async function cancelScheduledPost(postId: string): Promise<SocialResult<SocialPostRow>> {
    try {
        await requireSession()
        const supabase = createServerSupabaseClient()
        const { data: post } = await supabase
            .from('social_posts').select('*').eq('id', postId).single()
        if (!post) return { success: false, error: 'Post not found' }
        if (post.status !== 'scheduled') return { success: false, error: `Cannot cancel a ${post.status} post` }

        const cannotCancel = {
            success: false as const,
            error: 'Could not cancel on Upload-Post — the post may still publish. Try again or remove the connected account.',
        }

        // Resolve the account this post went out through — its API key and
        // sub-user name live on the post's social profile.
        const { data: profile } = post.social_profile_id
            ? await supabase
                  .from('social_profiles')
                  .select('*')
                  .eq('id', post.social_profile_id)
                  .maybeSingle()
            : { data: null }
        if (!profile) return cannotCancel
        let provider
        try {
            provider = getSocialProvider(resolveProfileKey(profile as SocialProfileDbRow))
        } catch (e) {
            console.warn('[SocialService] no usable key to cancel with', e)
            return cannotCancel
        }
        const username = profile.upload_post_username

        // Resolve the provider job id: prefer the one backfilled at creation
        // time, else fall back to the same listScheduled match (covers rows
        // created before the backfill existed, or whose backfill missed).
        let jobId = post.upload_post_job_id
        // When no confident match is found, jobs scheduled near this post's
        // time (but not confidently matched) — used below to distinguish
        // "nothing exists remotely" from "something's there but ambiguous".
        let nearbyJobs: ScheduledPost[] | null = null
        if (!jobId && post.scheduled_at) {
            try {
                const scheduled = await provider.listScheduled(username)
                jobId = findMatchingScheduledJob(scheduled, post.scheduled_at, post.platforms)?.jobId ?? null
                if (!jobId) {
                    const targetMs = new Date(post.scheduled_at).getTime()
                    nearbyJobs = scheduled.filter((job) => {
                        const jobMs = new Date(job.scheduledAt).getTime()
                        return Number.isFinite(jobMs) && Math.abs(jobMs - targetMs) <= AMBIGUOUS_CANCEL_WINDOW_MS
                    })
                }
            } catch (e) {
                // Couldn't verify whether a remote job exists — do NOT mark
                // cancelled DB-only on an unverified guess (that's the exact
                // silent-failure bug this rewrite exists to close).
                console.warn('[SocialService] listScheduled lookup for cancel failed', e)
                return cannotCancel
            }
        }

        if (jobId) {
            try {
                await provider.cancelScheduled(jobId)
            } catch (e) {
                console.warn('[SocialService] provider cancel failed', e)
                return cannotCancel
            }
        } else if (nearbyJobs && nearbyJobs.length > 0) {
            // listScheduled succeeded and found jobs plausibly close (within
            // 10 minutes) to this post's scheduled time, but none confidently
            // matched (ambiguous or platform mismatch) — refuse to guess
            // which one is ours, and do NOT mark this row cancelled DB-only
            // while a live provider job may still be the real one and fire.
            return {
                success: false,
                error:
                    "Could not confidently identify this post's scheduled job on Upload-Post — cancel it from the Upload-Post dashboard, then refresh",
            }
        }
        // else: no plausible provider job at all near this post's scheduled
        // time (already fired, never made it to Upload-Post, or we had no
        // scheduled_at to check against) — nothing exists remotely to
        // cancel, so a DB-only cancel below is honest, not a guess.

        const { data: row, error } = await supabase
            .from('social_posts')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('id', postId)
            .select('*')
            .single()
        if (error) throw new Error(error.message)
        const [enriched] = await attachAvatarInfo(supabase, [row as SocialPostDbRow])
        return { success: true, data: enriched }
    } catch (e) {
        return fail(e)
    }
}
