/**
 * Core "send an approved agent message to Fanvue" — shared by the manual
 * approve flow (AgentInboxService.approveAndSend) and the autopilot flush.
 * Handles the send, status transitions, counter bump and fan-memory refresh.
 */
import { agentSupabase } from './db'
import { makeFanvueClient } from './inboxSync'
import { updateFanMemoryFromChat } from './draftPipeline'
import { loadConnection } from '@/lib/fanvue/tokenStore'

export interface SendAgentMessageResult {
    success: boolean
    externalMessageId?: string
    error?: string
}

function currentPeriod(): string {
    // 'YYYY-MM' from an ISO string (no Date.now/new Date locale needs).
    return new Date().toISOString().slice(0, 7)
}

/**
 * Send an already-approved agent_messages row. Resolves the sending account
 * from the chat's avatar. On success: status 'sent' + external id + counters;
 * on failure: status 'failed' + error_message. Idempotent-ish: only acts on
 * rows still in 'approved'.
 */
export async function sendAgentMessage(messageId: string): Promise<SendAgentMessageResult> {
    const supabase = agentSupabase()
    const { data: msg } = await supabase
        .from('agent_messages')
        .select('*')
        .eq('id', messageId)
        .maybeSingle()
    if (!msg) return { success: false, error: 'Message not found' }
    if (msg.status !== 'approved') return { success: false, error: `Message is ${msg.status}, not approved` }

    const text = (msg.text ?? '').trim()
    if (!text) return { success: false, error: 'Empty message' }

    const { data: chat } = await supabase
        .from('agent_chats')
        .select('*')
        .eq('id', msg.chat_id)
        .single()
    if (!chat) return { success: false, error: 'Chat not found' }

    const { data: avatar } = await supabase
        .from('avatars')
        .select('user_id, fanvue_creator_uuid')
        .eq('id', chat.avatar_id)
        .single()
    if (!avatar?.user_id) return { success: false, error: 'Avatar has no owner' }
    const connection = await loadConnection(avatar.user_id)
    if (!connection) return { success: false, error: 'Fanvue not connected' }

    const client = makeFanvueClient(avatar.user_id)
    try {
        const res = await client.sendChatMessage(avatar.fanvue_creator_uuid ?? null, chat.external_chat_id, {
            text,
        })
        await supabase
            .from('agent_messages')
            .update({
                status: 'sent',
                external_message_id: res.messageUuid,
                sent_at: new Date().toISOString(),
                send_after: null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', messageId)
        await supabase
            .from('agent_chats')
            .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('id', chat.id)
        // Counters (best-effort).
        const period = currentPeriod()
        await supabase.rpc('increment_agent_counter', {
            p_org: chat.organization_id,
            p_avatar: chat.avatar_id,
            p_period: period,
            p_counter: 'messages_sent',
        })
        if (msg.approved_by === 'autopilot') {
            await supabase.rpc('increment_agent_counter', {
                p_org: chat.organization_id,
                p_avatar: chat.avatar_id,
                p_period: period,
                p_counter: 'auto_sent',
            })
        }
        void updateFanMemoryFromChat(chat.id)
        return { success: true, externalMessageId: res.messageUuid }
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        await supabase
            .from('agent_messages')
            .update({ status: 'failed', error_message: message, updated_at: new Date().toISOString() })
            .eq('id', messageId)
        return { success: false, error: message }
    }
}
