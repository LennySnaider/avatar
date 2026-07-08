/**
 * GET /api/cron/social-reconcile
 *
 * Scheduled sweep (see `vercel.json`, every 15 minutes) that reconciles
 * `social_posts` rows against the Upload-Post provider for cases the
 * webhook may have missed:
 *
 *  1. Posts stuck in `processing` for >15 minutes (webhook never arrived,
 *     or arrived and failed to write) — polls `getRequestStatus` and
 *     flips them to `published`/`failed`.
 *
 *  1b. Posts still in `scheduled` status whose `scheduled_at` is more than
 *     15 minutes in the past and that already have an
 *     `upload_post_request_id` (i.e. Upload-Post accepted the dispatch at
 *     creation time) — same `getRequestStatus` poll/mapping as step 1, so a
 *     missed publish/failure webhook doesn't leave a fired post stuck
 *     showing `scheduled` forever.
 *
 *  2. Posts in `scheduled` status with `upload_post_job_id IS NULL` —
 *     `PublishResponse` (the synchronous return value of
 *     `publishVideo`/`publishPhoto`/`publishText`) has no `jobId` field
 *     (see task-3-report.md, finding #6), so scheduled posts are created
 *     without one, which breaks `cancelScheduledPost`'s provider-side
 *     cancel call. This step calls `listScheduled()` and tries to match
 *     rows to jobs by scheduled time + platform set (see
 *     `findScheduledMatch` below for the exact correlation rule and its
 *     limits).
 *
 * Gated by `CRON_SECRET` (Bearer token) when that env var is set.
 * Uses the service-role Supabase client (bypasses RLS).
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getSocialProvider, SOCIAL_USERNAME } from '@/lib/social/provider'
import type { ScheduledPost, SocialProvider } from '@/lib/social/providers/SocialProvider'
import type { Platform } from '@/@types/social'
import type { Database as BaseDatabase, Json } from '@/@types/supabase'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// Local typed Supabase client — see the same note in
// `src/app/api/webhooks/upload-post/route.ts` / `src/services/SocialService.ts`:
// `social_posts` isn't in the shared `Database` type yet, so this mirrors
// Task 3's local-extension workaround for the one table this route needs.
// ---------------------------------------------------------------------------

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
    Insert: Partial<SocialPostsTable['Row']>
    Update: Partial<SocialPostsTable['Row']>
    Relationships: []
}

type SocialDatabase = BaseDatabase & {
    public: BaseDatabase['public'] & {
        Tables: BaseDatabase['public']['Tables'] & {
            social_posts: SocialPostsTable
        }
    }
}

function socialSupabase(): SupabaseClient<SocialDatabase> {
    return createServerSupabaseClient() as unknown as SupabaseClient<SocialDatabase>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * `RequestStatus` is `{ status: string; data?: Record<string, unknown> }` —
 * NOT `{ completed, failed }` as the brief's illustrative snippet assumed
 * (reconciled against the real `SocialProvider.ts`, see task-1-report.md).
 * Upload-Post's own status strings aren't formally enumerated in this
 * codebase, so this maps generously: anything that reads as a terminal
 * success/failure state resolves; anything else is treated as still
 * in-flight and left untouched until the next sweep.
 */
function mapProviderStatus(status: string): 'published' | 'failed' | 'processing' {
    const s = status.toLowerCase()
    if (s === 'completed' || s === 'success' || s === 'published') return 'published'
    if (s === 'failed' || s === 'error') return 'failed'
    return 'processing'
}

/**
 * Poll the provider for a single post's request status and flip
 * `social_posts.status` to `published`/`failed` if it resolved to a
 * terminal state. Shared by both the stale-`processing` sweep and the
 * overdue-`scheduled` sweep below — same mapping, same error handling,
 * just different source queries for which rows are candidates.
 *
 * Returns `true` if the row's status was updated, `false` otherwise
 * (still in-flight, missing request id, or the poll/update itself failed).
 */
async function pollAndFlipStatus(
    supabase: SupabaseClient<SocialDatabase>,
    provider: SocialProvider,
    postId: string,
    requestId: string | null,
): Promise<boolean> {
    if (!requestId) return false
    try {
        const result = await provider.getRequestStatus(requestId)
        const mapped = mapProviderStatus(result.status)
        if (mapped === 'processing') return false
        const errMsg =
            mapped === 'failed'
                ? typeof result.data?.error === 'string'
                    ? (result.data.error as string)
                    : 'unknown_provider_error'
                : null
        await supabase
            .from('social_posts')
            .update({
                status: mapped,
                published_at: mapped === 'published' ? new Date().toISOString() : null,
                error_message: errMsg,
                updated_at: new Date().toISOString(),
            })
            .eq('id', postId)
        return true
    } catch (e) {
        console.warn('[social-reconcile] status poll failed', postId, e)
        return false
    }
}

/** Narrow `social_posts.platforms` (jsonb) down to a `Set<Platform>` for comparison. */
function toPlatformSet(platforms: Json): Set<Platform> {
    if (!Array.isArray(platforms)) return new Set()
    return new Set(platforms.filter((p): p is Platform => typeof p === 'string'))
}

function platformSetsEqual(a: Set<Platform>, b: Set<Platform>): boolean {
    if (a.size === 0 || a.size !== b.size) return false
    for (const platform of a) if (!b.has(platform)) return false
    return true
}

/**
 * Correlate a `social_posts` row (scheduled, missing `upload_post_job_id`)
 * to a provider-side scheduled job.
 *
 * `ScheduledPost` (the real return shape of `listScheduled`, see
 * `SocialProvider.ts`) is `{ jobId, scheduledAt, title, platforms: Platform[] }`
 * — there is no request id, post id, or any other correlation key shared
 * with our DB row. `social_posts.platforms` happens to be stored as the
 * same bare `Platform[]` shape `SocialService.createSocialPost` sent to the
 * provider (confirmed by reading that file), so platform-set equality is a
 * meaningful signal, not a guess.
 *
 * Match rule: exact `scheduled_at` timestamp match within 60 seconds AND
 * an identical (non-empty) platform set. If more than one candidate
 * satisfies that, we refuse to guess — this only backfills confident,
 * unambiguous matches, and already-claimed jobs (within this run) are
 * excluded so two rows can't be matched to the same job.
 */
function findScheduledMatch(
    row: { scheduled_at: string | null; platforms: Json },
    jobs: ScheduledPost[],
    usedJobIds: Set<string>,
): ScheduledPost | null {
    if (!row.scheduled_at) return null
    const rowTime = new Date(row.scheduled_at).getTime()
    if (!Number.isFinite(rowTime)) return null
    const rowPlatforms = toPlatformSet(row.platforms)
    if (rowPlatforms.size === 0) return null

    const candidates = jobs.filter((job) => {
        if (usedJobIds.has(job.jobId)) return false
        const jobTime = new Date(job.scheduledAt).getTime()
        if (!Number.isFinite(jobTime) || Math.abs(jobTime - rowTime) > 60_000) return false
        return platformSetsEqual(rowPlatforms, new Set(job.platforms))
    })

    return candidates.length === 1 ? candidates[0] : null
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
    const secret = process.env.CRON_SECRET
    const authHeader = request.headers.get('authorization')
    if (secret && authHeader !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const supabase = socialSupabase()
    const provider = getSocialProvider()

    // -------------------------------------------------------------------------
    // 1. Reconcile posts stuck in `processing`
    // -------------------------------------------------------------------------
    const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const { data: stuck } = await supabase
        .from('social_posts')
        .select('id, upload_post_request_id')
        .eq('status', 'processing')
        .lt('created_at', cutoff)
        .not('upload_post_request_id', 'is', null)
        .limit(50)

    let statusUpdated = 0
    for (const post of stuck ?? []) {
        if (await pollAndFlipStatus(supabase, provider, post.id, post.upload_post_request_id)) {
            statusUpdated++
        }
    }

    // -------------------------------------------------------------------------
    // 1b. Reconcile posts still `scheduled` whose fire time has passed —
    // if the webhook never arrived (or arrived and failed to write), these
    // otherwise sit as `scheduled` forever even though Upload-Post already
    // dispatched them. Same status mapping/polling as step 1, just a
    // different source query (past-due `scheduled_at` instead of stale
    // `processing`), and only for rows that already have a request id
    // (i.e. Upload-Post accepted the dispatch — see `createSocialPost`).
    // -------------------------------------------------------------------------
    const scheduledCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const { data: overdueScheduled } = await supabase
        .from('social_posts')
        .select('id, upload_post_request_id')
        .eq('status', 'scheduled')
        .lt('scheduled_at', scheduledCutoff)
        .not('upload_post_request_id', 'is', null)
        .limit(50)

    let scheduledStatusUpdated = 0
    for (const post of overdueScheduled ?? []) {
        if (await pollAndFlipStatus(supabase, provider, post.id, post.upload_post_request_id)) {
            scheduledStatusUpdated++
        }
    }

    // -------------------------------------------------------------------------
    // 2. Backfill `upload_post_job_id` for scheduled posts missing it
    // -------------------------------------------------------------------------
    const { data: missingJobId } = await supabase
        .from('social_posts')
        .select('id, scheduled_at, platforms')
        .eq('status', 'scheduled')
        .is('upload_post_job_id', null)
        .limit(50)

    let jobIdChecked = 0
    let jobIdBackfilled = 0
    if (missingJobId && missingJobId.length > 0) {
        jobIdChecked = missingJobId.length
        try {
            const jobs = await provider.listScheduled(SOCIAL_USERNAME)
            const usedJobIds = new Set<string>()
            for (const row of missingJobId) {
                const match = findScheduledMatch(row, jobs, usedJobIds)
                if (!match) continue
                usedJobIds.add(match.jobId)
                await supabase
                    .from('social_posts')
                    .update({
                        upload_post_job_id: match.jobId,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', row.id)
                jobIdBackfilled++
            }
        } catch (e) {
            console.warn('[social-reconcile] listScheduled failed', e)
        }
    }

    return NextResponse.json({
        checked: (stuck ?? []).length,
        updated: statusUpdated,
        scheduledChecked: (overdueScheduled ?? []).length,
        scheduledUpdated: scheduledStatusUpdated,
        jobIdChecked,
        jobIdBackfilled,
    })
}
