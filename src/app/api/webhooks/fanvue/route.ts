/**
 * POST /api/webhooks/fanvue
 *
 * Real-time Fanvue message events. Supports BOTH the legacy and the new
 * `creator.*` event families (Fanvue is migrating; legacy events are
 * deprecated end of Aug 2026), so subscribing to either keeps the inbox live.
 *
 * Signature (docs api.fanvue.com/docs/webhooks/signature-verification):
 *   header `X-Fanvue-Signature: t=<unix>,v0=<hex hmac-sha256>`
 *   signed string = `${t}.${rawBody}`  (RAW bytes — never re-serialize)
 *   secret = FANVUE_WEBHOOK_SECRET (Developer Area → Events → Signing Secret)
 *   tolerance 300s, timing-safe compare.
 *   This SAME scheme is used across ALL event families (legacy + creator.* +
 *   checkout) — verified against the docs. The "Standard-Webhooks envelope"
 *   Fanvue mentions is only the BODY shape (id/type/timestamp/data), not the
 *   signature headers.
 *
 * Payload shapes differ between families. The new `creator.message.received`
 * event is METADATA-ONLY (nested under `data`, `data.object === 'message'`, no
 * message text/media) — we resolve the chat from `data.creator.uuid` /
 * `data.fan.uuid` and then fetch the text via the API (`ingestFanChat`). The
 * poll cron is the fallback for anything the webhook misses.
 *
 * There is no API to create webhook subscriptions — they're configured in
 * Fanvue's dashboard pointing at this URL.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import crypto from 'node:crypto'
import { loadConnection } from '@/lib/fanvue/tokenStore'
import {
    ingestFanChat,
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

/** `X-Fanvue-Signature: t=<unix>,v0=<hex>` over `${t}.${rawBody}`. */
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
    // Legacy (text carried in the payload)
    event?: string
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
    // Both families
    type?: string
    id?: string
    // New `creator.*` (Standard-Webhooks envelope, message events METADATA-ONLY)
    data?: {
        object?: string // 'message' | 'fan_message_read' | ...
        uuid?: string
        sender?: string // 'fan' | 'creator'
        created_at?: string
        deleted_at?: string | null
        creator?: { uuid?: string }
        fan?: { uuid?: string; email?: string }
    }
}

/** Resolve which app user owns the connection whose account received this event. */
async function findConnectionOwner(
    recipientUuid: string | null,
): Promise<{ userId: string; accountUuid: string | null } | null> {
    const supabase = agentSupabase()
    // Agency mapping: recipient (the creator) → avatar → owner.
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

    const eventName = (payload.type ?? payload.event ?? '').toLowerCase()
    // New family nests the resource under `data` (data.object === 'message').
    const isNewFormat = Boolean(payload.data && typeof payload.data === 'object')

    try {
        if (eventName.includes('message.received') || eventName === 'message_received') {
            if (isNewFormat) {
                await handleNewInbound(payload)
            } else {
                await handleLegacyInbound(payload)
            }
        }
        // message.sent / message.read (either family): our own echoes dedupe by
        // external id; nothing to do for the draft flow. (Future: read state.)
    } catch (err) {
        console.error('[fanvue webhook] handler error', err)
        // Still 200 to avoid a retry storm — the poll cron will reconcile.
    }

    return NextResponse.json({ ok: true })
}

/**
 * New `creator.message.received`: metadata-only. Resolve the chat from
 * `data.creator.uuid` (recipient) + `data.fan.uuid` (sender), then fetch the
 * actual message text via the API before drafting.
 */
async function handleNewInbound(payload: FanvueWebhookBody) {
    const creatorUuid = payload.data?.creator?.uuid ?? null
    const fanUuid = payload.data?.fan?.uuid ?? null
    // sender 'creator' would be an outbound echo — only the fan's messages draft.
    if (payload.data?.sender && payload.data.sender !== 'fan') return
    if (!creatorUuid || !fanUuid) return

    const owner = await findConnectionOwner(creatorUuid)
    if (!owner) {
        console.warn('[fanvue webhook] no connection owner for creator', creatorUuid)
        return
    }
    const target = await resolveTargetAvatar(owner.userId, creatorUuid, owner.accountUuid)
    if (!target) return

    const result = await ingestFanChat({
        userId: owner.userId,
        target,
        fanUuid,
        connectionAccountUuid: owner.accountUuid,
    })
    if (!result) return
    await touchFanMemory(target, fanUuid)

    if (result.latestFromFan && result.mode !== 'off' && target.personaEnabled) {
        const draft = await generateDraftReply(result.chatId)
        if (draft && result.mode === 'auto') {
            await maybeAutopilotSend(result.chatId, draft.messageId)
        }
    }
}

/** Legacy `message.received`: text is carried in the payload. */
async function handleLegacyInbound(payload: FanvueWebhookBody) {
    const owner = await findConnectionOwner(payload.recipientUuid ?? null)
    if (!owner) {
        console.warn('[fanvue webhook] no connection owner for recipient', payload.recipientUuid)
        return
    }
    const target = await resolveTargetAvatar(
        owner.userId,
        payload.recipientUuid ?? null,
        owner.accountUuid,
    )
    if (!target) return

    const fanUuid = payload.sender?.uuid
    if (!fanUuid) return

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
        const draft = await generateDraftReply(chat.id)
        if (draft && chat.mode === 'auto') {
            await maybeAutopilotSend(chat.id, draft.messageId)
        }
    }
}
