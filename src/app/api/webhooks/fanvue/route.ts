/**
 * POST /api/webhooks/fanvue
 *
 * Real-time Fanvue events (message.received / message.sent / message.read).
 * Unlike Upload-Post, Fanvue DOES sign webhooks, so a bad/absent signature is
 * rejected with 401.
 *
 * Signature (docs api.fanvue.com/docs/webhooks/signature-verification.md):
 *   header `X-Fanvue-Signature: t=<unix>,v0=<hex hmac-sha256>`
 *   signed string = `${t}.${rawBody}`  (RAW bytes — never re-serialize)
 *   secret = FANVUE_WEBHOOK_SECRET (Developer Area → Events → Signing Secret)
 *   tolerance 300s, timing-safe compare.
 *
 * There is no API to create webhook subscriptions — they're configured in
 * Fanvue's dashboard pointing at this URL.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import crypto from 'node:crypto'
import { loadConnection } from '@/lib/fanvue/tokenStore'
import {
    ingestMessage,
    resolveTargetAvatar,
    touchFanMemory,
    upsertChat,
} from '@/lib/agent/inboxSync'
import { generateDraftReply } from '@/lib/agent/draftPipeline'
import { maybeAutopilotSend } from '@/lib/agent/autopilot'
import { agentSupabase } from '@/lib/agent/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const TOLERANCE_SECONDS = 300

function verifySignature(rawBody: string, header: string | null, secret: string): boolean {
    if (!header) return false
    const parts = Object.fromEntries(
        header.split(',').map((kv) => {
            const i = kv.indexOf('=')
            return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()]
        }),
    )
    const t = parts['t']
    const v0 = parts['v0']
    if (!t || !v0) return false

    const age = Math.abs(Date.now() / 1000 - Number(t))
    if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) return false

    const expected = crypto
        .createHmac('sha256', secret)
        .update(`${t}.${rawBody}`)
        .digest('hex')
    const a = Buffer.from(expected)
    const b = Buffer.from(v0)
    return a.length === b.length && crypto.timingSafeEqual(a, b)
}

interface FanvueWebhookBody {
    event?: string
    type?: string
    message?: {
        uuid?: string
        text?: string | null
        sentAt?: string
        mediaUuids?: string[]
    }
    messageUuid?: string
    sender?: { uuid?: string; handle?: string; displayName?: string; avatarUrl?: string }
    recipientUuid?: string
    timestamp?: string
}

/** Resolve which app user owns the connection whose account received this event. */
async function findConnectionOwner(recipientUuid: string | null): Promise<{ userId: string; accountUuid: string | null } | null> {
    const supabase = agentSupabase()
    // Try the avatar mapping first (agency): recipient → avatar → owner.
    if (recipientUuid) {
        const { data: avatar } = await supabase
            .from('avatars')
            .select('user_id')
            .eq('fanvue_creator_uuid', recipientUuid)
            .maybeSingle()
        if (avatar?.user_id) {
            const conn = await loadConnection(avatar.user_id)
            if (conn) return { userId: avatar.user_id, accountUuid: conn.fanvueAccountUuid }
        }
    }
    return null
}

export async function POST(req: NextRequest) {
    const rawBody = await req.text()
    const secret = process.env.FANVUE_WEBHOOK_SECRET
    if (!secret) {
        console.error('[fanvue webhook] FANVUE_WEBHOOK_SECRET not set — rejecting')
        return NextResponse.json({ error: 'not configured' }, { status: 401 })
    }
    if (!verifySignature(rawBody, req.headers.get('x-fanvue-signature'), secret)) {
        return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
    }

    let payload: FanvueWebhookBody
    try {
        payload = JSON.parse(rawBody) as FanvueWebhookBody
    } catch {
        return NextResponse.json({ ok: true }) // ack malformed to stop retries
    }

    const eventName = (payload.event ?? payload.type ?? '').toLowerCase()

    try {
        if (eventName.includes('message.received') || eventName === 'message_received') {
            const owner = await findConnectionOwner(payload.recipientUuid ?? null)
            if (!owner) {
                console.warn('[fanvue webhook] no connection owner for recipient', payload.recipientUuid)
                return NextResponse.json({ ok: true })
            }
            const target = await resolveTargetAvatar(
                owner.userId,
                payload.recipientUuid ?? null,
                owner.accountUuid,
            )
            if (!target) return NextResponse.json({ ok: true })

            const fanUuid = payload.sender?.uuid
            if (!fanUuid) return NextResponse.json({ ok: true })

            const sentAt = payload.message?.sentAt ?? payload.timestamp ?? null
            const chat = await upsertChat({
                target,
                fanUuid,
                fanDisplayName: payload.sender?.displayName ?? payload.sender?.handle ?? null,
                fanHandle: payload.sender?.handle ?? null,
                fanAvatarUrl: payload.sender?.avatarUrl ?? null,
                lastMessageAt: sentAt,
                lastFanMessageAt: sentAt,
            })
            const { inserted } = await ingestMessage({
                organizationId: target.organizationId,
                chatId: chat.id,
                direction: 'in',
                externalMessageId: payload.message?.uuid ?? payload.messageUuid ?? null,
                text: payload.message?.text ?? null,
                mediaUuids: payload.message?.mediaUuids,
                externalCreatedAt: sentAt,
            })
            await touchFanMemory(target, fanUuid, payload.sender?.displayName)

            // Draft if the chat is on and the persona is enabled. New inbound only.
            if (inserted && chat.mode !== 'off' && target.personaEnabled) {
                try {
                    const draft = await generateDraftReply(chat.id)
                    // In auto mode, gate + queue the send (risk classifier decides).
                    if (draft && chat.mode === 'auto') {
                        await maybeAutopilotSend(chat.id, draft.messageId)
                    }
                } catch (e) {
                    console.warn('[fanvue webhook] draft/autopilot failed', e)
                }
            }
        }
        // message.sent / message.read: our own echoes dedupe by external id;
        // nothing else to do for the draft flow. (Future: mark read state.)
    } catch (err) {
        console.error('[fanvue webhook] handler error', err)
        // Still 200 to avoid a retry storm — the poll cron will reconcile.
    }

    return NextResponse.json({ ok: true })
}
