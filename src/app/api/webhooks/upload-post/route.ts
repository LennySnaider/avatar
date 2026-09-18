/**
 * POST /api/webhooks/upload-post
 *
 * Receives event notifications from the Upload-Post provider.
 *
 * Ported from agentsoft's `src/app/api/webhooks/upload-post/route.ts`
 * (multi-tenant version), simplified for prime-avatar:
 *   - No organization resolution. Since 2026-09-17 there is ONE Upload-Post
 *     agency account (platform key in env) whose account-level webhook is
 *     registered once, pointing at THIS endpoint. Publish events correlate
 *     purely by `upload_post_request_id`; account events (connected /
 *     disconnected / reauth_required) carry `profile_username`, which is
 *     globally unique in `social_profiles`, so no per-org state is needed.
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
import { getSocialProvider } from '@/lib/social/provider'
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
    /** Sub-user the event is about (account-level webhook, per the Webhooks doc). */
    profile_username?: string
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

    // Underscore names are what the current Webhooks doc lists; the dotted
    // ones are the legacy spelling this handler was written against.
    if (name === 'social_account_connected' || name === 'social_account.connected' || name === 'account.connected') {
        return 'account_connected'
    }
    if (name === 'social_account_disconnected' || name === 'social_account.disconnected' || name === 'account.disconnected') {
        return 'account_disconnected'
    }
    if (name === 'social_account_reauth_required' || name === 'social_account.reauth_required') {
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

/**
 * F4.2 Tarea 5 (comentarios-ia-social) — best-effort: si el payload de
 * `publish_success` trae la plataforma y el id/url real del post, adelanta
 * el target en `social_post_targets` sin esperar al próximo barrido del cron
 * `social-comments-poll` (que igual lo sincronizaría desde el history de
 * Upload-Post). Se mira en top-level (`platform`) y bajo `data`
 * (`data.platform`, `data.result.post_id|url`, `data.post_id|url`) — la
 * forma real de un `publish_success` con estos campos no está confirmada en
 * este repo (el resto del handler ya lo advierte para `job_id`), así que se
 * cubren las variantes documentadas sin asumir cuál llega en la práctica.
 */
function extractPlatform(payload: UploadPostWebhookPayload): string | null {
    const candidates: unknown[] = [payload.platform, payload.data?.platform]
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.length > 0) return candidate
    }
    return null
}

function extractPlatformPostId(payload: UploadPostWebhookPayload): string | null {
    const result = (payload.data?.result ?? {}) as Record<string, unknown>
    const candidates: unknown[] = [result.post_id, payload.data?.post_id]
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.length > 0) return candidate
    }
    return null
}

function extractPostUrl(payload: UploadPostWebhookPayload): string | null {
    const result = (payload.data?.result ?? {}) as Record<string, unknown>
    const candidates: unknown[] = [result.url, payload.data?.url]
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.length > 0) return candidate
    }
    return null
}

/**
 * Upsert best-effort de `social_post_targets` para el post que este webhook
 * acaba de marcar `published`. Nunca lanza — cualquier fallo (falta de
 * plataforma/id en el payload, error de Supabase) se loguea y se ignora: el
 * cron `social-comments-poll` sincroniza lo mismo desde el history como red
 * de respaldo, así que esto sólo adelanta el dato, nunca es la única fuente.
 */
async function upsertTargetFromWebhook(
    supabase: ReturnType<typeof createServerSupabaseClient>,
    postRow: { id: string; organization_id: string; published_at: string | null } | null | undefined,
    payload: UploadPostWebhookPayload,
): Promise<void> {
    if (!postRow) return
    const platform = extractPlatform(payload)
    const platformPostId = extractPlatformPostId(payload)
    if (!platform || !platformPostId) return
    const postUrl = extractPostUrl(payload)

    const { error } = await supabase.from('social_post_targets').upsert(
        {
            organization_id: postRow.organization_id,
            social_post_id: postRow.id,
            platform,
            platform_post_id: platformPostId,
            post_url: postUrl,
            published_at: postRow.published_at,
        },
        { onConflict: 'social_post_id,platform' },
    )
    if (error) {
        console.warn(
            '[upload-post webhook] no se pudo adelantar social_post_targets (el cron de comentarios lo sincroniza igual)',
            { socialPostId: postRow.id, platform },
            error.message,
        )
    }
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
                    // `upload_post_request_id` NO es único (columna + índice
                    // simples, migración `20260707_social_media.sql`): puede
                    // haber más de una fila de `social_posts` con el mismo
                    // request_id. `.select()` SIN `.single()/.maybeSingle()`
                    // — con cualquiera de esos dos, más de una fila hace que
                    // PostgREST devuelva 406 y haga ROLLBACK del UPDATE
                    // entero (era una única sentencia UPDATE...RETURNING),
                    // así que el post JAMÁS quedaba `published`. El error SÍ
                    // se comprueba ahora (antes se descartaba en silencio).
                    const { data: updatedPosts, error: updateError } = await supabase
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
                        .select('id, organization_id, published_at')
                    if (updateError) {
                        console.error('[upload-post webhook] publish_success update failed', { requestId }, updateError.message)
                    }

                    // Best-effort, en su propio try/catch: nunca debe tumbar
                    // el resto del webhook (ya 200 siempre, pero tampoco
                    // queremos perder el log de arriba si esto explota). Se
                    // repite por cada fila que haya compartido este
                    // request_id — inofensivo: cada upsert es idempotente,
                    // keyed por (social_post_id, platform).
                    try {
                        for (const postRow of updatedPosts ?? []) {
                            await upsertTargetFromWebhook(supabase, postRow, payload)
                        }
                    } catch (e) {
                        console.warn('[upload-post webhook] upsertTargetFromWebhook falló inesperadamente', e)
                    }
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

            // Account events: refresh the connected-socials snapshot of that
            // profile so connect / re-auth show up without anyone clicking
            // "Refresh". Best-effort — the accounts page and the connect
            // callback sync the same thing, so a miss here only delays the badge.
            case 'account_connected':
            case 'account_disconnected':
            case 'account_reauth_required': {
                const username = payload.profile_username ?? payload.username
                if (!username) {
                    console.log('[upload-post webhook]', canonical, 'without profile_username', payload)
                    break
                }
                try {
                    const details = await getSocialProvider().getProfile(username)
                    const { error } = await supabase
                        .from('social_profiles')
                        .update({
                            connected_platforms: (details.connectedAccounts ?? []) as unknown as Json,
                            upload_post_metadata: (details.metadata ?? null) as Json | null,
                            last_synced_at: new Date().toISOString(),
                        })
                        .eq('upload_post_username', username)
                    if (error) {
                        console.warn('[upload-post webhook] profile snapshot update failed', { username, canonical }, error.message)
                    } else {
                        console.log('[upload-post webhook]', canonical, username, 'snapshot refreshed')
                    }
                } catch (e) {
                    console.warn('[upload-post webhook] could not refresh profile snapshot', { username, canonical }, e)
                }
                break
            }

            // No `social_events_log` table exists in this schema — remaining
            // events are informational-only, logged for operator visibility.
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
