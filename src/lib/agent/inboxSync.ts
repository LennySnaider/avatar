/**
 * Shared Fanvue → agent_inbox ingestion, used by BOTH the webhook (real-time)
 * and the poll cron (fallback / initial import). Idempotent: chats keyed by
 * (avatar, fan) and messages deduped by external id.
 */
import { FanvueClient } from '@/lib/fanvue/FanvueClient'
import { getValidAccessToken } from '@/lib/fanvue/tokenStore'
import { getOrgContextForUser } from '@/lib/tenant/getOrgContext'
import { agentSupabase, type AgentChatRow, type AgentMsgDirection } from './db'
import type { FanvueMessage } from '@/lib/fanvue/types'

/** Resolve the avatar (+ its owner user + fanvue mode) for a connection's creator recipient. */
export interface ResolvedTarget {
    avatarId: string
    organizationId: string
    userId: string
    creatorUuid: string | null // null = self account of the connection
    personaEnabled: boolean
}

/**
 * Given the Fanvue connection owner and the message's `recipientUuid` (the
 * creator who received it), find which of our avatars maps to it.
 *  - agency: avatars.fanvue_creator_uuid === recipientUuid
 *  - self:   the connection's own account → avatars whose fanvue_creator_uuid IS NULL
 */
export async function resolveTargetAvatar(
    userId: string,
    recipientUuid: string | null,
    connectionAccountUuid: string | null,
): Promise<ResolvedTarget | null> {
    const supabase = agentSupabase()
    const orgCtx = await getOrgContextForUser(userId)
    if (!orgCtx) return null

    // Prefer an explicit agency mapping.
    if (recipientUuid) {
        const { data: mapped } = await supabase
            .from('avatars')
            .select('id, user_id')
            .eq('fanvue_creator_uuid', recipientUuid)
            .maybeSingle()
        if (mapped) {
            return finalize(mapped.id, orgCtx.organizationId, userId, recipientUuid)
        }
    }

    // Self account: recipient is the connection's own account (or unmapped) →
    // an avatar owned by this user WITHOUT an explicit creator mapping.
    const isSelf = !recipientUuid || recipientUuid === connectionAccountUuid
    if (isSelf) {
        const { data: selfAvatar } = await supabase
            .from('avatars')
            .select('id, user_id')
            .eq('user_id', userId)
            .is('fanvue_creator_uuid', null)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle()
        if (selfAvatar) {
            return finalize(selfAvatar.id, orgCtx.organizationId, userId, null)
        }
    }
    return null

    async function finalize(
        avatarId: string,
        organizationId: string,
        ownerUserId: string,
        creatorUuid: string | null,
    ): Promise<ResolvedTarget> {
        const { data: persona } = await supabase
            .from('avatar_personas')
            .select('enabled')
            .eq('avatar_id', avatarId)
            .maybeSingle()
        return {
            avatarId,
            organizationId,
            userId: ownerUserId,
            creatorUuid,
            personaEnabled: Boolean(persona?.enabled),
        }
    }
}

/** Upsert a chat row for (avatar, fan). Returns the chat id. */
export async function upsertChat(input: {
    target: ResolvedTarget
    fanUuid: string
    fanDisplayName?: string | null
    fanHandle?: string | null
    fanAvatarUrl?: string | null
    lastMessageAt?: string | null
    lastFanMessageAt?: string | null
    /** Counterpart is a creator/bot (spam) — start such chats OFF so the agent
     * never auto-drafts to them. */
    isCreator?: boolean
}): Promise<AgentChatRow> {
    const supabase = agentSupabase()
    const { data: existing } = await supabase
        .from('agent_chats')
        .select('*')
        .eq('avatar_id', input.target.avatarId)
        .eq('platform', 'fanvue')
        .eq('external_chat_id', input.fanUuid)
        .maybeSingle()

    if (existing) {
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
        if (input.fanDisplayName) patch.fan_display_name = input.fanDisplayName
        if (input.fanHandle) patch.fan_handle = input.fanHandle
        if (input.fanAvatarUrl) patch.fan_avatar_url = input.fanAvatarUrl
        if (input.lastMessageAt) patch.last_message_at = input.lastMessageAt
        if (input.lastFanMessageAt) patch.last_fan_message_at = input.lastFanMessageAt
        // Keep the creator flag fresh, but NEVER override a mode the user set.
        if (input.isCreator !== undefined) patch.is_creator = input.isCreator
        const { data } = await supabase
            .from('agent_chats')
            .update(patch)
            .eq('id', existing.id)
            .select('*')
            .single()
        return (data ?? existing) as AgentChatRow
    }

    const { data, error } = await supabase
        .from('agent_chats')
        .insert({
            organization_id: input.target.organizationId,
            avatar_id: input.target.avatarId,
            platform: 'fanvue',
            external_chat_id: input.fanUuid,
            fan_display_name: input.fanDisplayName ?? null,
            fan_handle: input.fanHandle ?? null,
            fan_avatar_url: input.fanAvatarUrl ?? null,
            is_creator: input.isCreator ?? false,
            // Creator/bot spam starts OFF; real fans start in draft mode.
            mode: input.isCreator ? 'off' : 'draft',
            last_message_at: input.lastMessageAt ?? null,
            last_fan_message_at: input.lastFanMessageAt ?? null,
        })
        .select('*')
        .single()
    if (error) throw new Error(error.message)
    return data as AgentChatRow
}

/** Insert a message if its external id isn't already stored (dedupe webhook+poll+echo). */
export async function ingestMessage(input: {
    organizationId: string
    chatId: string
    direction: AgentMsgDirection
    externalMessageId: string | null
    text: string | null
    mediaUuids?: string[]
    externalCreatedAt?: string | null
}): Promise<{ inserted: boolean }> {
    const supabase = agentSupabase()
    if (input.externalMessageId) {
        const { data: dupe } = await supabase
            .from('agent_messages')
            .select('id')
            .eq('chat_id', input.chatId)
            .eq('external_message_id', input.externalMessageId)
            .maybeSingle()
        if (dupe) return { inserted: false }
    }
    const { error } = await supabase.from('agent_messages').insert({
        organization_id: input.organizationId,
        chat_id: input.chatId,
        direction: input.direction,
        external_message_id: input.externalMessageId,
        text: input.text,
        media: (input.mediaUuids ?? []).map((uuid) => ({ uuid })) as never,
        status: input.direction === 'in' ? 'received' : 'sent',
        external_created_at: input.externalCreatedAt ?? null,
    })
    if (error) {
        // Unique-violation races (webhook + cron at once) are benign.
        if (/duplicate key/i.test(error.message)) return { inserted: false }
        throw new Error(error.message)
    }
    return { inserted: true }
}

/** Update the fan's memory row's last-seen (cheap heartbeat; facts filled by the LLM pass). */
export async function touchFanMemory(target: ResolvedTarget, fanUuid: string, displayName?: string | null) {
    const supabase = agentSupabase()
    await supabase
        .from('avatar_fan_memories')
        .upsert(
            {
                organization_id: target.organizationId,
                avatar_id: target.avatarId,
                platform: 'fanvue',
                external_fan_id: fanUuid,
                display_name: displayName ?? null,
                last_seen_at: new Date().toISOString(),
            },
            { onConflict: 'avatar_id,platform,external_fan_id' },
        )
}

/** Build a Fanvue client for a connection owner. */
export function makeFanvueClient(userId: string): FanvueClient {
    return new FanvueClient({ getAccessToken: (opts) => getValidAccessToken(userId, opts) })
}

/** Was this message sent BY the fan (in) or by the creator/us (out)? */
export function messageDirection(msg: FanvueMessage, creatorSideUuids: Set<string>): AgentMsgDirection {
    return creatorSideUuids.has(msg.sender.uuid) ? 'out' : 'in'
}

/**
 * Fetch + ingest ONE fan's chat (session-less, for the webhook). The new
 * Fanvue `creator.message.received` event is metadata-only (no text), so we
 * pull the recent messages here. Returns the chat id and whether the latest
 * message is from the fan (i.e. worth drafting a reply to).
 */
export async function ingestFanChat(input: {
    userId: string
    target: ResolvedTarget
    fanUuid: string
    connectionAccountUuid: string | null
}): Promise<{ chatId: string; latestFromFan: boolean; mode: string } | null> {
    const client = makeFanvueClient(input.userId)
    const creatorSideUuids = new Set<string>(
        [input.target.creatorUuid, input.connectionAccountUuid].filter((v): v is string => Boolean(v)),
    )
    let messagesRes
    try {
        messagesRes = await client.listChatMessages(input.target.creatorUuid, input.fanUuid, {
            page: 1,
            size: 15,
            markAsRead: false,
        })
    } catch (e) {
        console.warn('[ingestFanChat] listChatMessages failed', e)
        return null
    }

    // Fan display: the fan is whoever isn't on the creator side.
    const fanMsg = messagesRes.data.find((m) => !creatorSideUuids.has(m.sender.uuid))
    const chat = await upsertChat({
        target: input.target,
        fanUuid: input.fanUuid,
        fanHandle: fanMsg?.sender.handle ?? null,
        fanDisplayName: fanMsg?.sender.handle ?? null,
        lastMessageAt: messagesRes.data[messagesRes.data.length - 1]?.sentAt ?? null,
    })
    for (const m of messagesRes.data) {
        await ingestMessage({
            organizationId: input.target.organizationId,
            chatId: chat.id,
            direction: messageDirection(m, creatorSideUuids),
            externalMessageId: m.uuid,
            text: m.text,
            mediaUuids: m.mediaUuids,
            externalCreatedAt: m.sentAt,
        })
    }
    const latest = messagesRes.data[messagesRes.data.length - 1]
    return {
        chatId: chat.id,
        latestFromFan: Boolean(latest && messageDirection(latest, creatorSideUuids) === 'in'),
        mode: chat.mode,
    }
}
