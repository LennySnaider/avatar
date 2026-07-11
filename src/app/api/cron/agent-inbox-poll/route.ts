/**
 * GET /api/cron/agent-inbox-poll
 *
 * Fallback for the Fanvue webhook (see vercel.json, every 5 min): pulls recent
 * chats/messages for every avatar with an enabled persona + connected Fanvue
 * account, so drafts still appear if a webhook is missed (or not configured in
 * dev). Reuses AgentInboxService.syncFanvueInbox per avatar via its owner.
 *
 * Gated by CRON_SECRET (Bearer), same as the other crons.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { agentSupabase } from '@/lib/agent/db'
import { getOrgContextForUser } from '@/lib/tenant/getOrgContext'
import { loadConnection } from '@/lib/fanvue/tokenStore'
import {
    ingestMessage,
    makeFanvueClient,
    messageDirection,
    resolveTargetAvatar,
    upsertChat,
} from '@/lib/agent/inboxSync'
import { generateDraftReply } from '@/lib/agent/draftPipeline'
import { flushDueAutopilotMessages, maybeAutopilotSend } from '@/lib/agent/autopilot'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(request: NextRequest) {
    const secret = process.env.CRON_SECRET
    const authHeader = request.headers.get('authorization')
    if (secret && authHeader !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const supabase = agentSupabase()
    // Avatars whose persona is enabled — the only ones worth polling.
    const { data: personas } = await supabase
        .from('avatar_personas')
        .select('avatar_id')
        .eq('enabled', true)
        .limit(500)
    const avatarIds = [...new Set((personas ?? []).map((p) => p.avatar_id))]
    if (avatarIds.length === 0) return NextResponse.json({ polled: 0, chats: 0, drafts: 0 })

    const { data: avatars } = await supabase
        .from('avatars')
        .select('id, user_id, fanvue_creator_uuid')
        .in('id', avatarIds)

    let polled = 0
    let chatCount = 0
    let drafts = 0

    for (const avatar of avatars ?? []) {
        if (!avatar.user_id) continue
        // One connection per owner; skip if not connected.
        const connection = await loadConnection(avatar.user_id)
        if (!connection?.refreshToken && !connection?.accessToken) continue
        const orgCtx = await getOrgContextForUser(avatar.user_id)
        if (!orgCtx) continue

        const creatorUuid = avatar.fanvue_creator_uuid ?? null
        const target = await resolveTargetAvatar(avatar.user_id, creatorUuid, connection.fanvueAccountUuid)
        if (!target || !target.personaEnabled) continue

        const client = makeFanvueClient(avatar.user_id)
        const creatorSideUuids = new Set<string>(
            [creatorUuid, connection.fanvueAccountUuid].filter((v): v is string => Boolean(v)),
        )

        try {
            const chatsRes = await client.listChats(creatorUuid, { page: 1, size: 15 })
            polled++
            for (const summary of chatsRes.data) {
                // Only touch chats with a fan message newer than what we know.
                const chat = await upsertChat({
                    target,
                    fanUuid: summary.user.uuid,
                    fanDisplayName: summary.user.displayName ?? summary.user.handle,
                    fanHandle: summary.user.handle,
                    fanAvatarUrl: summary.user.avatarUrl ?? null,
                    isCreator: Boolean(summary.isCreator),
                    lastMessageAt: summary.lastMessageAt,
                })
                chatCount++

                const messagesRes = await client.listChatMessages(creatorUuid, summary.user.uuid, {
                    page: 1,
                    size: 15,
                    markAsRead: false,
                })
                let anyInserted = false
                for (const m of messagesRes.data) {
                    const { inserted } = await ingestMessage({
                        organizationId: target.organizationId,
                        chatId: chat.id,
                        direction: messageDirection(m, creatorSideUuids),
                        externalMessageId: m.uuid,
                        text: m.text,
                        mediaUuids: m.mediaUuids,
                        externalCreatedAt: m.sentAt,
                    })
                    anyInserted = anyInserted || inserted
                }

                const latest = messagesRes.data[messagesRes.data.length - 1]
                if (
                    anyInserted &&
                    chat.mode !== 'off' &&
                    latest &&
                    messageDirection(latest, creatorSideUuids) === 'in'
                ) {
                    try {
                        const draft = await generateDraftReply(chat.id)
                        drafts++
                        if (draft && chat.mode === 'auto') {
                            await maybeAutopilotSend(chat.id, draft.messageId)
                        }
                    } catch (e) {
                        console.warn('[agent-inbox-poll] draft/autopilot failed', e)
                    }
                }
            }
        } catch (e) {
            console.warn('[agent-inbox-poll] poll failed for avatar', avatar.id, e)
        }
    }

    // Send any autopilot messages whose humanized delay has elapsed.
    const flushed = await flushDueAutopilotMessages()

    return NextResponse.json({ polled, chats: chatCount, drafts, autoSent: flushed.sent, autoFailed: flushed.failed })
}
