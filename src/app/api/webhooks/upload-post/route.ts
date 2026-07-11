/**
 * POST /api/webhooks/upload-post
 *
 * Receives event notifications from the Upload-Post provider.
 *
 * Ported from agentsoft's `src/app/api/webhooks/upload-post/route.ts`
 * (multi-tenant version), simplified for prime-avatar:
 *   - No organization resolution. Each avatar has its own Upload-Post
 *     account (see `social_profiles.avatar_id`/`api_key`), and every one of
 *     those accounts registers THIS same endpoint — correlation is purely by
 *     `upload_post_request_id`, so the handler needs no per-account state.
 *   - No `social_events_log` table exists in this project's schema (it was
 *     never part of Task 2's migration), so unknown/informational events
 *     (account connected/disconnected, reauth-required, ffmpeg completed)
 *     are simply logged to the console instead of persisted.
 *
 * Per Upload-Post docs the canonical event names are:
 *   - upload_completed               (publish success / failure — inspect data.status)
 *   - social_account.connected
 *   - social_account.disconnected
 *   - social_account.reauth_required (token expired, user must re-OAuth)
 *
 * We also accept legacy names (`post.published`, `account.connected`, …) for
 * backwards compatibility, same as agentsoft. `normalizeEventName()` folds
 * both into a canonical internal key that the switch operates on — copied
 * verbatim from agentsoft's handler.
 *
 * HMAC verification (SHA-256) is attempted when both a secret
 * (`UPLOAD_POST_WEBHOOK_SECRET`) and the `x-upload-post-signature` header
 * are present; a mismatch is logged and the event is dropped (no DB write)
 * but the endpoint still answers 200 — see the always-200 note below.
 * Unsigned payloads are ACCEPTED (with a warning): verified empirically,
 * Upload-Post's notifications endpoint ignores any `secret` field, so real
 * webhooks always arrive unsigned; the handler's writes are keyed by the
 * unguessable `upload_post_request_id`, bounding the blast radius.
 *
 * Error-as-data: this route ALWAYS returns `{ ok: true }` with a 200
 * status, regardless of what happens internally (bad signature, bad JSON,
 * unknown event, DB failure, …). This is deliberate — Upload-Post retries
 * non-2xx responses, and every failure mode here is already logged via
 * `console.log`/`console.warn`/`console.error` for operator visibility.
 *
 * Uses the service-role Supabase client (bypasses RLS) since webhooks carry
 * no user session.
 *
 * @module app/api/webhooks/upload-post
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { UploadPostProvider } from '@/lib/social/providers/UploadPostProvider'
import type { Json } from '@/@types/supabase'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Raw wire payload from Upload-Post. Their REST responses elsewhere in this
 * codebase (see `UploadPostProvider.ts`'s `listScheduled`/`getHistory`
 * mappers) use snake_case keys (`job_id`, `request_id`, `created_at`, …), so
 * that's the primary shape we expect here. We also accept the camelCase
 * variants (`requestId`, `jobId`) defensively since `@/@types/social.ts`'s
 * `UploadPostWebhookEvent` documents an idealized camelCase shape that may
 * reflect a different API version or normalization layer.
 */
interface UploadPostWebhookPayload {
    event: string
    username?: string
    request_id?: string
    requestId?: string
    job_id?: string
    jobId?: string
    scheduled_job_id?: string
    platform?: string
    data?: Record<string, unknown>
}

type CanonicalEvent =
    | 'publish_success'
    | 'publish_failed'
    | 'account_connected'
    | 'account_disconnected'
    | 'account_reauth_required'
    | 'ffmpeg_completed'
    | 'unknown'

/**
 * Map provider-emitted event names to canonical internal events.
 *
 * Upload-Post uses a single `upload_completed` event whose final status is
 * carried in `data.status`. We peek at the payload to split success vs
 * failure into two internal events. Legacy names map straight through.
 *
 * Copied verbatim from agentsoft's `src/app/api/webhooks/upload-post/route.ts`.
 */
function normalizeEventName(
    raw: string,
    data?: Record<string, unknown>,
): CanonicalEvent {
    const name = (raw ?? '').toLowerCase().trim()
    const dataStatus =
        data && typeof data.status === 'string' ? data.status.toLowerCase() : null

    if (name === 'upload_completed' || name === 'upload.completed') {
        return dataStatus === 'failed' ? 'publish_failed' : 'publish_success'
    }
    if (name === 'upload_failed' || name === 'post.failed') {
        return 'publish_failed'
    }
    if (name === 'post.published' || name === 'post_published') {
        return 'publish_success'
    }

    if (name === 'social_account.connected' || name === 'account.connected') {
        return 'account_connected'
    }
    if (name === 'social_account.disconnected' || name === 'account.disconnected') {
        return 'account_disconnected'
    }
    if (name === 'social_account.reauth_required') {
        return 'account_reauth_required'
    }

    if (name === 'ffmpeg.completed' || name === 'ffmpeg_completed') {
        return 'ffmpeg_completed'
    }

    return 'unknown'
}

/**
 * Best-effort extraction of any job/schedule identifier the payload might
 * carry, under any of the field names Upload-Post (or its docs) use
 * elsewhere: `job_id`/`jobId` (see `UploadPostProvider.listScheduled`'s
 * mapper) or `scheduled_job_id`. Checked at both the top level and nested
 * under `data`, since the exact shape of a real `publish_success` payload
 * carrying a job id has not been observed in this codebase (agentsoft's own
 * handler never captured one either — see task-3-report.md's finding).
 */
function extractJobId(payload: UploadPostWebhookPayload): string | null {
    const candidates: unknown[] = [
        payload.job_id,
        payload.jobId,
        payload.scheduled_job_id,
        payload.data?.job_id,
        payload.data?.jobId,
        payload.data?.scheduled_job_id,
    ]
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.length > 0) return candidate
    }
    return null
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
    const rawBody = await req.text()
    const signature = req.headers.get('x-upload-post-signature')
    const secret = process.env.UPLOAD_POST_WEBHOOK_SECRET

    // -------------------------------------------------------------------------
    // 1. Signature gate (best-effort)
    //
    // Verified empirically (2026-07-07): Upload-Post's notifications config
    // stores ONLY `webhook_url` — a `secret` field sent to
    // POST /api/uploadposts/users/notifications is silently ignored, so the
    // provider has no shared secret to sign with and real webhooks arrive
    // UNSIGNED. Dropping unsigned events would therefore drop every real
    // event. Behavior:
    //   - If a signature header IS present and a secret is configured,
    //     validate it; mismatch ⇒ log + skip the DB write, still 200.
    //   - If no signature header, accept-but-log. Blast radius is bounded:
    //     the only state this handler mutates is keyed by the unguessable
    //     `upload_post_request_id`, and only status/timestamps change.
    // -------------------------------------------------------------------------
    if (signature && secret) {
        const provider = new UploadPostProvider('unused', 'unused')
        if (!provider.verifyWebhookSignature(rawBody, signature, secret)) {
            console.log('[upload-post webhook] invalid_signature — dropping event')
            return NextResponse.json({ ok: true })
        }
    } else if (!signature) {
        console.warn(
            '[upload-post webhook] No x-upload-post-signature header — accepting unverified ' +
                '(Upload-Post does not support webhook secrets; writes are request_id-keyed).',
        )
    }

    // -------------------------------------------------------------------------
    // 2. Parse body
    // -------------------------------------------------------------------------
    let payload: UploadPostWebhookPayload
    try {
        payload = JSON.parse(rawBody) as UploadPostWebhookPayload
    } catch {
        console.log('[upload-post webhook] invalid_json — dropping event')
        return NextResponse.json({ ok: true })
    }

    if (!payload?.event) {
        console.log('[upload-post webhook] missing event name — dropping', payload)
        return NextResponse.json({ ok: true })
    }

    // -------------------------------------------------------------------------
    // 3. Dispatch by canonical event type
    // -------------------------------------------------------------------------
    const canonical = normalizeEventName(payload.event, payload.data)
    const supabase = createServerSupabaseClient()

    try {
        switch (canonical) {
            case 'publish_success': {
                const requestId = payload.request_id ?? payload.requestId
                if (requestId) {
                    const jobId = extractJobId(payload)
                    await supabase
                        .from('social_posts')
                        .update({
                            status: 'published',
                            published_at: new Date().toISOString(),
                            upload_post_response: (payload.data ?? {}) as Json,
                            error_message: null,
                            updated_at: new Date().toISOString(),
                            ...(jobId ? { upload_post_job_id: jobId } : {}),
                        })
                        .eq('upload_post_request_id', requestId)
                } else {
                    console.log('[upload-post webhook] publish_success without request_id', payload)
                }
                break
            }

            case 'publish_failed': {
                const requestId = payload.request_id ?? payload.requestId
                if (requestId) {
                    const errMsg =
                        typeof payload.data?.error === 'string'
                            ? (payload.data.error as string)
                            : 'unknown_provider_error'
                    const jobId = extractJobId(payload)
                    await supabase
                        .from('social_posts')
                        .update({
                            status: 'failed',
                            error_message: errMsg,
                            upload_post_response: (payload.data ?? {}) as Json,
                            updated_at: new Date().toISOString(),
                            ...(jobId ? { upload_post_job_id: jobId } : {}),
                        })
                        .eq('upload_post_request_id', requestId)
                } else {
                    console.log('[upload-post webhook] publish_failed without request_id', payload)
                }
                break
            }

            // No `social_events_log` table exists in this single-user schema —
            // these are informational-only events, logged for operator visibility.
            default:
                console.log('[upload-post webhook]', canonical, payload.event)
                break
        }
    } catch (err) {
        console.error('[upload-post webhook] handler error:', err)
        // Still 200 to avoid provider retry storm — error is logged above.
    }

    return NextResponse.json({ ok: true })
}
