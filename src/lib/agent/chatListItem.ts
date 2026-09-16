/**
 * Mapea una fila de `agent_chats` (+ el nombre del avatar y los "extras" que
 * cada llamador ya calculó aparte: preview del último mensaje, si hay
 * borrador) al DTO que consume el Inbox.
 *
 * Puro y sin imports de Supabase — así lo puede usar tanto `listAgentChats`
 * como `getAgentChatThread` sin que se desincronicen (antes cada una
 * construía el objeto a mano, y `getAgentChatThread` no traía `platform` en
 * el tipo aunque sí lo copiaba). Task 7 (Inbox de comentarios sociales).
 */
import type { AgentChatMode, AgentChatRow } from './db'
import { resolveDeliveryChannel, type DeliveryChannel } from './channelRouting'
import { platformFromChat } from '@/lib/social/comments/ids'

/** Subconjunto de `agent_chats.context` que le interesa al Inbox. */
export interface ChatListItemContext {
    platformPostId: string | null
    postUrl: string | null
    caption: string | null
}

export interface ChatListItem {
    id: string
    avatarId: string
    avatarName: string | null
    fanDisplayName: string | null
    fanHandle: string | null
    fanAvatarUrl: string | null
    mode: AgentChatMode
    isCreator: boolean
    needsAttention: boolean
    attentionReason: string | null
    lastMessageAt: string | null
    lastMessagePreview: string | null
    hasDraft: boolean
    platform: string
    channel: DeliveryChannel
    socialPlatform: string | null
    context: ChatListItemContext | null
}

/**
 * `agent_chats.context` es `Json | null` sin esquema: una fila corrupta o de
 * otra versión puede traer cualquier cosa (string, array, número). En vez de
 * castear ciegamente, cada campo se valida por separado — lo que no es un
 * string se descarta a `null` en vez de tumbar el mapeo entero.
 */
function parseChatContext(raw: unknown): ChatListItemContext | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    const c = raw as Record<string, unknown>
    return {
        platformPostId:
            typeof c.platformPostId === 'string' ? c.platformPostId : null,
        postUrl: typeof c.postUrl === 'string' ? c.postUrl : null,
        caption: typeof c.caption === 'string' ? c.caption : null,
    }
}

type ChatRowForListItem = Pick<
    AgentChatRow,
    | 'id'
    | 'avatar_id'
    | 'platform'
    | 'fan_display_name'
    | 'fan_handle'
    | 'fan_avatar_url'
    | 'mode'
    | 'is_creator'
    | 'needs_attention'
    | 'attention_reason'
    | 'last_message_at'
    | 'context'
>

export function toChatListItem(
    row: ChatRowForListItem,
    avatarName: string | null,
    extras: { lastMessagePreview: string | null; hasDraft: boolean },
): ChatListItem {
    const channel = resolveDeliveryChannel(row.platform)
    return {
        id: row.id,
        avatarId: row.avatar_id,
        avatarName,
        fanDisplayName: row.fan_display_name,
        fanHandle: row.fan_handle,
        fanAvatarUrl: row.fan_avatar_url,
        mode: row.mode,
        isCreator: row.is_creator,
        needsAttention: row.needs_attention,
        attentionReason: row.attention_reason,
        lastMessageAt: row.last_message_at,
        lastMessagePreview: extras.lastMessagePreview,
        hasDraft: extras.hasDraft,
        platform: row.platform,
        channel,
        socialPlatform: platformFromChat(row.platform),
        // Fanvue/Telegram nunca escriben `context` (ver AgentChatsTable en
        // db.ts) — sólo se intenta parsear para chats de comentarios.
        context: channel === 'social_comment' ? parseChatContext(row.context) : null,
    }
}
