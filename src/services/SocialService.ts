'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { auth } from '@/auth'
import { createServerSupabaseClient, getStoragePublicUrl } from '@/lib/supabase'
import { getSocialProvider, SOCIAL_USERNAME } from '@/lib/social/provider'
import { validatePostForPlatforms } from '@/lib/social/platformValidators'
import { appendHashtagsToCaption } from '@/lib/social/hashtagHelpers'
import { ALL_PLATFORMS } from '@/@types/social'
import type { Platform, PlatformTarget } from '@/@types/social'
import type { PublishResponse, ScheduledPost } from '@/lib/social/providers/SocialProvider'
import type { Database as BaseDatabase, Json } from '@/@types/supabase'

/**
 * `src/@types/supabase.ts` is a hand-maintained Database type that Task 2's
 * migration (social_profiles/social_posts) never got merged into. Rather than
 * edit that shared file (out of this task's file scope — see task-3 report),
 * extend it locally so queries against the two new tables stay fully typed.
 */
type SocialProfilesTable = {
    Row: {
        id: string
        upload_post_username: string
        status: string
        connected_platforms: Json
        upload_post_metadata: Json | null
        last_synced_at: string | null
        created_at: string
    }
    Insert: {
        id?: string
        upload_post_username: string
        status?: string
        connected_platforms?: Json
        upload_post_metadata?: Json | null
        last_synced_at?: string | null
        created_at?: string
    }
    Update: {
        id?: string
        upload_post_username?: string
        status?: string
        connected_platforms?: Json
        upload_post_metadata?: Json | null
        last_synced_at?: string | null
        created_at?: string
    }
    Relationships: []
}

type SocialPostsTable = {
    Row: {
        id: string
        social_profile_id: string | null
        generation_id: string | null
        user_id: string | null
        caption: string
        hashtags: string[]
        content_type: string
        media_urls: string[]
        platforms: Json
        status: string
        scheduled_at: string | null
        published_at: string | null
        upload_post_request_id: string | null
        upload_post_job_id: string | null
        upload_post_response: Json | null
        error_message: string | null
        created_at: string
        updated_at: string
    }
    Insert: {
        id?: string
        social_profile_id?: string | null
        generation_id?: string | null
        user_id?: string | null
        caption?: string
        hashtags?: string[]
        content_type: string
        media_urls?: string[]
        platforms?: Json
        status?: string
        scheduled_at?: string | null
        published_at?: string | null
        upload_post_request_id?: string | null
        upload_post_job_id?: string | null
        upload_post_response?: Json | null
        error_message?: string | null
        created_at?: string
        updated_at?: string
    }
    Update: {
        id?: string
        social_profile_id?: string | null
        generation_id?: string | null
        user_id?: string | null
        caption?: string
        hashtags?: string[]
        content_type?: string
        media_urls?: string[]
        platforms?: Json
        status?: string
        scheduled_at?: string | null
        published_at?: string | null
        upload_post_request_id?: string | null
        upload_post_job_id?: string | null
        upload_post_response?: Json | null
        error_message?: string | null
        created_at?: string
        updated_at?: string
    }
    Relationships: []
}

type SocialDatabase = BaseDatabase & {
    public: BaseDatabase['public'] & {
        Tables: BaseDatabase['public']['Tables'] & {
            social_profiles: SocialProfilesTable
            social_posts: SocialPostsTable
        }
    }
}

/** Service-role client typed to include the social_* tables (see note above). */
function socialSupabase(): SupabaseClient<SocialDatabase> {
    return createServerSupabaseClient() as unknown as SupabaseClient<SocialDatabase>
}

export interface SocialResult<T> { success: boolean; data?: T; error?: string }

export interface SocialProfileRow {
    id: string
    upload_post_username: string
    status: string
    connected_platforms: unknown[]
    last_synced_at: string | null
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
}

export interface CreateSocialPostInput {
    generationId?: string
    caption: string
    hashtags: string[]
    platforms: string[]
    scheduledAt?: string | null
}

const fail = (e: unknown): { success: false; error: string } => ({
    success: false,
    error: e instanceof Error ? e.message : String(e),
})

async function requireSession() {
    const session = await auth()
    if (!session?.user?.id) throw new Error('Not authenticated')
    return session.user.id
}

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

const SCHEDULE_MATCH_WINDOW_MS = 2 * 60 * 1000

/**
 * Match a locally-known {scheduledAt, caption} pair against Upload-Post's
 * `listScheduled` results, to recover the `jobId` that `PublishResponse`
 * never carries (see task-3 report addendum). A job matches when its
 * `scheduledAt` is within a 2-minute window of ours AND our caption starts
 * with its `title` (Upload-Post may truncate the title it stores).
 */
function findMatchingScheduledJob(
    jobs: ScheduledPost[],
    targetScheduledAt: string | Date,
    caption: string,
): ScheduledPost | undefined {
    const targetMs = new Date(targetScheduledAt).getTime()
    if (Number.isNaN(targetMs)) return undefined
    return jobs.find((job) => {
        if (!job.title || !caption.startsWith(job.title)) return false
        const jobMs = new Date(job.scheduledAt).getTime()
        if (Number.isNaN(jobMs)) return false
        return Math.abs(jobMs - targetMs) <= SCHEDULE_MATCH_WINDOW_MS
    })
}

export async function ensureSocialProfile(): Promise<SocialResult<SocialProfileRow>> {
    try {
        await requireSession()
        const supabase = socialSupabase()
        const { data: existing } = await supabase
            .from('social_profiles')
            .select('*')
            .eq('upload_post_username', SOCIAL_USERNAME)
            .maybeSingle()
        if (existing) return { success: true, data: existing as SocialProfileRow }

        const provider = getSocialProvider()
        // Idempotent-ish: Upload-Post 409/exists errors are tolerated
        try {
            await provider.createProfile(SOCIAL_USERNAME)
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            if (!/exist/i.test(msg)) throw e
        }
        const { data, error } = await supabase
            .from('social_profiles')
            .insert({ upload_post_username: SOCIAL_USERNAME })
            .select('*')
            .single()
        if (error) throw new Error(error.message)
        return { success: true, data: data as SocialProfileRow }
    } catch (e) {
        return fail(e)
    }
}

export async function getSocialProfileAction(): Promise<SocialResult<SocialProfileRow | null>> {
    try {
        await requireSession()
        const supabase = socialSupabase()
        const { data, error } = await supabase
            .from('social_profiles')
            .select('*')
            .eq('upload_post_username', SOCIAL_USERNAME)
            .maybeSingle()
        if (error) throw new Error(error.message)
        return { success: true, data: (data as SocialProfileRow) ?? null }
    } catch (e) {
        return fail(e)
    }
}

export async function generateSocialConnectUrl(): Promise<SocialResult<{ accessUrl: string; expiresAt: string | null }>> {
    try {
        await requireSession()
        const ensured = await ensureSocialProfile()
        if (!ensured.success) return { success: false, error: ensured.error }
        const provider = getSocialProvider()
        const redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3030'}/api/social/callback`
        const res = await provider.generateConnectUrl({
            username: SOCIAL_USERNAME,
            redirectUrl,
        })
        return { success: true, data: { accessUrl: res.accessUrl, expiresAt: res.expiresAt.toISOString() } }
    } catch (e) {
        return fail(e)
    }
}

export async function syncConnectedAccounts(): Promise<SocialResult<SocialProfileRow>> {
    try {
        await requireSession()
        const provider = getSocialProvider()
        const profile = await provider.getProfile(SOCIAL_USERNAME)
        const supabase = socialSupabase()
        const { data, error } = await supabase
            .from('social_profiles')
            .update({
                connected_platforms: toJson(profile.connectedAccounts ?? []),
                upload_post_metadata: profile.metadata ? toJson(profile.metadata) : null,
                last_synced_at: new Date().toISOString(),
            })
            .eq('upload_post_username', SOCIAL_USERNAME)
            .select('*')
            .single()
        if (error) throw new Error(error.message)
        return { success: true, data: data as SocialProfileRow }
    } catch (e) {
        return fail(e)
    }
}

export async function createSocialPost(input: CreateSocialPostInput): Promise<SocialResult<SocialPostRow>> {
    try {
        const userId = await requireSession()
        const supabase = socialSupabase()

        const { data: profile } = await supabase
            .from('social_profiles')
            .select('id')
            .eq('upload_post_username', SOCIAL_USERNAME)
            .maybeSingle()
        if (!profile) return { success: false, error: 'No social profile — connect accounts first' }

        const { platforms, invalid } = toValidatedPlatforms(input.platforms)
        if (invalid.length > 0) return { success: false, error: `Unknown platform(s): ${invalid.join(', ')}` }
        if (platforms.length === 0) return { success: false, error: 'Pick at least one platform' }

        // Resolve media from the gallery generation (durable public URL)
        let mediaUrls: string[] = []
        let contentType: 'photo' | 'video' | 'text' = 'text'
        let generationId: string | null = null
        if (input.generationId) {
            const { data: gen, error: genErr } = await supabase
                .from('generations')
                .select('id, media_type, storage_path, user_id')
                .eq('id', input.generationId)
                .single()
            if (genErr || !gen) return { success: false, error: 'Generation not found' }
            if (gen.user_id && gen.user_id !== userId) return { success: false, error: 'Not your media' }
            mediaUrls = [getStoragePublicUrl('generations', gen.storage_path)]
            contentType = gen.media_type === 'VIDEO' ? 'video' : 'photo'
            generationId = gen.id
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

        const provider = getSocialProvider()
        const platformTargets: PlatformTarget[] = platforms.map((platform) => ({ platform }))
        const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : undefined
        const publishBase = {
            username: SOCIAL_USERNAME,
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
                const scheduled = await provider.listScheduled(SOCIAL_USERNAME)
                uploadPostJobId = findMatchingScheduledJob(scheduled, input.scheduledAt, caption)?.jobId ?? null
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
        return { success: true, data: row as SocialPostRow }
    } catch (e) {
        return fail(e)
    }
}

export async function listSocialPosts(): Promise<SocialResult<SocialPostRow[]>> {
    try {
        await requireSession()
        const supabase = socialSupabase()
        const { data, error } = await supabase
            .from('social_posts')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100)
        if (error) throw new Error(error.message)
        return { success: true, data: (data ?? []) as SocialPostRow[] }
    } catch (e) {
        return fail(e)
    }
}

export async function cancelScheduledPost(postId: string): Promise<SocialResult<SocialPostRow>> {
    try {
        await requireSession()
        const supabase = socialSupabase()
        const { data: post } = await supabase
            .from('social_posts').select('*').eq('id', postId).single()
        if (!post) return { success: false, error: 'Post not found' }
        if (post.status !== 'scheduled') return { success: false, error: `Cannot cancel a ${post.status} post` }

        const provider = getSocialProvider()
        const cannotCancel = {
            success: false as const,
            error: 'Could not cancel on Upload-Post — the post may still publish. Try again or remove the connected account.',
        }

        // Resolve the provider job id: prefer the one backfilled at creation
        // time, else fall back to the same listScheduled match (covers rows
        // created before the backfill existed, or whose backfill missed).
        let jobId = post.upload_post_job_id
        if (!jobId && post.scheduled_at) {
            try {
                const scheduled = await provider.listScheduled(SOCIAL_USERNAME)
                jobId = findMatchingScheduledJob(scheduled, post.scheduled_at, post.caption)?.jobId ?? null
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
        }
        // else: no matching provider job at all (already fired, or never
        // made it to Upload-Post) — nothing exists remotely to cancel, so a
        // DB-only cancel below is honest, not a guess.

        const { data: row, error } = await supabase
            .from('social_posts')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('id', postId)
            .select('*')
            .single()
        if (error) throw new Error(error.message)
        return { success: true, data: row as SocialPostRow }
    } catch (e) {
        return fail(e)
    }
}

export async function registerUploadPostWebhook(): Promise<SocialResult<{ configured: boolean }>> {
    try {
        await requireSession()
        const provider = getSocialProvider()
        const url = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3030'}/api/webhooks/upload-post`
        const events = [
            'post.published',
            'post.failed',
            'account.connected',
            'account.disconnected',
            'ffmpeg.completed',
        ]
        const result = await provider.configureWebhook(SOCIAL_USERNAME, url, events)
        return { success: true, data: { configured: result.configured } }
    } catch (e) {
        return fail(e)
    }
}
