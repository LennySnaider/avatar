'use server'

/**
 * Agent inbox — human-in-the-loop draft approval for Fanvue chats. All
 * org-scoped; the human edits/approves a draft, we send it as the avatar with
 * a humanized delay.
 */
import { getOrgContext } from '@/lib/tenant/getOrgContext'
import {
    agentSupabase,
    type AgentChatMode,
    type AgentChatRow,
    type AgentMessageRow,
} from '@/lib/agent/db'
import { generateDraftReply } from '@/lib/agent/draftPipeline'
import {
    ingestMessage,
    makeFanvueClient,
    messageDirection,
    resolveTargetAvatar,
    upsertChat,
} from '@/lib/agent/inboxSync'
import { sendAgentMessage } from '@/lib/agent/sendMessage'
import type { AutopilotConfig } from '@/lib/agent/autopilot'
import { updateFanMemoryFromChat } from '@/lib/agent/draftPipeline'
import { retrieveKnowledge } from '@/lib/agent/retrieval'
import { AGENT_UTILITY_MODEL } from '@/lib/agent/models'
import { uploadBufferMedia, uploadGenerationMedia } from '@/lib/fanvue/mediaUpload'
import { textToSpeech } from '@/services/MiniMaxService'
import { getStoragePublicUrl } from '@/lib/supabase'
import { GoogleGenAI, Type } from '@google/genai'
import { loadConnection } from '@/lib/fanvue/tokenStore'

export interface InboxResult<T> {
    success: boolean
    data?: T
    error?: string
}

export interface AgentChatListItem {
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
}

export interface AgentMessageDTO {
    id: string
    direction: 'in' | 'out'
    text: string | null
    status: string
    generatedBy: { provider?: string; model?: string } | null
    approvedBy: string | null
    errorMessage: string | null
    createdAt: string
    sentAt: string | null
}

const fail = (e: unknown): { success: false; error: string } => ({
    success: false,
    error: e instanceof Error ? e.message : String(e),
})

function toMessageDTO(row: AgentMessageRow): AgentMessageDTO {
    return {
        id: row.id,
        direction: row.direction,
        text: row.text,
        status: row.status,
        generatedBy: (row.generated_by ?? null) as AgentMessageDTO['generatedBy'],
        approvedBy: row.approved_by,
        errorMessage: row.error_message,
        createdAt: row.created_at,
        sentAt: row.sent_at,
    }
}

export interface AgentMetrics {
    fanChats: number
    drafts: number
    sent: number
    autoSent: number
    needsAttention: number
    autoRate: number // % of sends that were autopilot
}

/** Inbox headline metrics for the org (fan chats only). */
export async function getAgentMetrics(): Promise<InboxResult<AgentMetrics>> {
    try {
        const ctx = await getOrgContext()
        const supabase = agentSupabase()
        const org = ctx.organizationId

        const [fanChats, needsAttn, drafts, sentTotal, autoSent] = await Promise.all([
            supabase
                .from('agent_chats')
                .select('id', { count: 'exact', head: true })
                .eq('organization_id', org)
                .eq('is_creator', false),
            supabase
                .from('agent_chats')
                .select('id', { count: 'exact', head: true })
                .eq('organization_id', org)
                .eq('needs_attention', true),
            supabase
                .from('agent_messages')
                .select('id', { count: 'exact', head: true })
                .eq('organization_id', org)
                .eq('status', 'draft'),
            supabase
                .from('agent_messages')
                .select('id', { count: 'exact', head: true })
                .eq('organization_id', org)
                .eq('status', 'sent'),
            supabase
                .from('agent_messages')
                .select('id', { count: 'exact', head: true })
                .eq('organization_id', org)
                .eq('status', 'sent')
                .eq('approved_by', 'autopilot'),
        ])

        const sent = sentTotal.count ?? 0
        const auto = autoSent.count ?? 0
        return {
            success: true,
            data: {
                fanChats: fanChats.count ?? 0,
                drafts: drafts.count ?? 0,
                sent,
                autoSent: auto,
                needsAttention: needsAttn.count ?? 0,
                autoRate: sent > 0 ? Math.round((auto / sent) * 100) : 0,
            },
        }
    } catch (e) {
        return fail(e)
    }
}

export async function listAgentChats(filter?: {
    avatarId?: string
    hasDraft?: boolean
    /** Include other-creator / bot spam chats (hidden by default). */
    includeCreators?: boolean
}): Promise<InboxResult<AgentChatListItem[]>> {
    try {
        const ctx = await getOrgContext()
        const supabase = agentSupabase()
        let query = supabase
            .from('agent_chats')
            .select('*')
            .eq('organization_id', ctx.organizationId)
            .order('last_message_at', { ascending: false, nullsFirst: false })
            .limit(200)
        if (filter?.avatarId) query = query.eq('avatar_id', filter.avatarId)
        // Hide other-creator / bot spam unless explicitly asked for.
        if (!filter?.includeCreators) query = query.eq('is_creator', false)
        const { data: chats, error } = await query
        if (error) throw new Error(error.message)
        const rows = (chats ?? []) as AgentChatRow[]
        if (rows.length === 0) return { success: true, data: [] }

        // avatar names
        const avatarIds = [...new Set(rows.map((c) => c.avatar_id))]
        const { data: avatars } = await supabase
            .from('avatars')
            .select('id, name')
            .in('id', avatarIds)
        const nameById = new Map((avatars ?? []).map((a) => [a.id, a.name]))

        // draft + last-message preview per chat
        const chatIds = rows.map((c) => c.id)
        const { data: msgs } = await supabase
            .from('agent_messages')
            .select('chat_id, text, status, direction, created_at')
            .in('chat_id', chatIds)
            .order('created_at', { ascending: false })
        const draftChatIds = new Set<string>()
        const previewByChat = new Map<string, string>()
        for (const m of msgs ?? []) {
            if (m.status === 'draft') draftChatIds.add(m.chat_id)
            if (!previewByChat.has(m.chat_id) && m.text) previewByChat.set(m.chat_id, m.text)
        }

        const items: AgentChatListItem[] = rows.map((c) => ({
            id: c.id,
            avatarId: c.avatar_id,
            avatarName: nameById.get(c.avatar_id) ?? null,
            fanDisplayName: c.fan_display_name,
            fanHandle: c.fan_handle,
            fanAvatarUrl: c.fan_avatar_url,
            mode: c.mode,
            isCreator: c.is_creator,
            needsAttention: c.needs_attention,
            attentionReason: c.attention_reason,
            lastMessageAt: c.last_message_at,
            lastMessagePreview: previewByChat.get(c.id) ?? null,
            hasDraft: draftChatIds.has(c.id),
        }))
        const filtered = filter?.hasDraft ? items.filter((i) => i.hasDraft) : items
        return { success: true, data: filtered }
    } catch (e) {
        return fail(e)
    }
}

export async function getAgentChatThread(
    chatId: string,
): Promise<InboxResult<{ chat: AgentChatListItem; messages: AgentMessageDTO[]; fanMemory: { summary: string | null; facts: Record<string, string> } | null; hasVoice: boolean }>> {
    try {
        const ctx = await getOrgContext()
        const supabase = agentSupabase()
        const { data: chat } = await supabase
            .from('agent_chats')
            .select('*')
            .eq('organization_id', ctx.organizationId)
            .eq('id', chatId)
            .maybeSingle()
        if (!chat) return { success: false, error: 'Chat not found' }

        const [{ data: avatar }, { data: msgs }, { data: memory }] = await Promise.all([
            supabase.from('avatars').select('name, default_voice_id').eq('id', chat.avatar_id).maybeSingle(),
            supabase
                .from('agent_messages')
                .select('*')
                .eq('chat_id', chatId)
                .not('status', 'eq', 'discarded')
                .order('created_at', { ascending: true })
                .limit(200),
            supabase
                .from('avatar_fan_memories')
                .select('summary, facts')
                .eq('avatar_id', chat.avatar_id)
                .eq('platform', 'fanvue')
                .eq('external_fan_id', chat.external_chat_id)
                .maybeSingle(),
        ])

        const messages = ((msgs ?? []) as AgentMessageRow[]).map(toMessageDTO)
        return {
            success: true,
            data: {
                chat: {
                    id: chat.id,
                    avatarId: chat.avatar_id,
                    avatarName: avatar?.name ?? null,
                    fanDisplayName: chat.fan_display_name,
                    fanHandle: chat.fan_handle,
                    fanAvatarUrl: chat.fan_avatar_url,
                    mode: chat.mode,
                    isCreator: chat.is_creator,
                    needsAttention: chat.needs_attention,
                    attentionReason: chat.attention_reason,
                    lastMessageAt: chat.last_message_at,
                    lastMessagePreview: null,
                    hasDraft: messages.some((m) => m.status === 'draft'),
                },
                messages,
                fanMemory: memory
                    ? { summary: memory.summary, facts: (memory.facts ?? {}) as Record<string, string> }
                    : null,
                hasVoice: Boolean(avatar?.default_voice_id),
            },
        }
    } catch (e) {
        return fail(e)
    }
}

export async function setChatMode(
    chatId: string,
    mode: AgentChatMode,
): Promise<InboxResult<{ id: string; mode: AgentChatMode }>> {
    try {
        const ctx = await getOrgContext()
        const supabase = agentSupabase()
        const { data, error } = await supabase
            .from('agent_chats')
            .update({ mode, updated_at: new Date().toISOString() })
            .eq('organization_id', ctx.organizationId)
            .eq('id', chatId)
            .select('id, mode')
            .single()
        if (error) throw new Error(error.message)
        return { success: true, data: { id: data.id, mode: data.mode } }
    } catch (e) {
        return fail(e)
    }
}

export async function regenerateDraft(chatId: string): Promise<InboxResult<AgentMessageDTO>> {
    try {
        const ctx = await getOrgContext()
        const supabase = agentSupabase()
        const { data: chat } = await supabase
            .from('agent_chats')
            .select('id')
            .eq('organization_id', ctx.organizationId)
            .eq('id', chatId)
            .maybeSingle()
        if (!chat) return { success: false, error: 'Chat not found' }
        const result = await generateDraftReply(chatId)
        if (!result) return { success: false, error: 'Could not generate a draft (no persona or no fan message)' }
        const { data: row } = await supabase
            .from('agent_messages')
            .select('*')
            .eq('id', result.messageId)
            .single()
        return { success: true, data: toMessageDTO(row as AgentMessageRow) }
    } catch (e) {
        return fail(e)
    }
}

export async function discardDraft(messageId: string): Promise<InboxResult<{ id: string }>> {
    try {
        const ctx = await getOrgContext()
        const supabase = agentSupabase()
        const { error } = await supabase
            .from('agent_messages')
            .update({ status: 'discarded', updated_at: new Date().toISOString() })
            .eq('organization_id', ctx.organizationId)
            .eq('id', messageId)
            .eq('status', 'draft')
        if (error) throw new Error(error.message)
        return { success: true, data: { id: messageId } }
    } catch (e) {
        return fail(e)
    }
}

/**
 * Approve + send a draft as the avatar. Humanized delay scaled by length
 * (capped so it fits maxDuration). Updates fan memory after a successful send.
 */
export async function approveAndSend(
    messageId: string,
    editedText?: string,
): Promise<InboxResult<AgentMessageDTO>> {
    try {
        const ctx = await getOrgContext()
        const supabase = agentSupabase()
        const { data: msg } = await supabase
            .from('agent_messages')
            .select('*')
            .eq('organization_id', ctx.organizationId)
            .eq('id', messageId)
            .maybeSingle()
        if (!msg) return { success: false, error: 'Draft not found' }
        if (msg.status !== 'draft') return { success: false, error: `Cannot send a ${msg.status} message` }

        const text = (editedText ?? msg.text ?? '').trim()
        if (!text) return { success: false, error: 'Message is empty' }

        // Approve with the edited text + human approver, clear any attention flag.
        await supabase
            .from('agent_messages')
            .update({ status: 'approved', approved_by: ctx.userId, text, updated_at: new Date().toISOString() })
            .eq('id', messageId)
        await supabase
            .from('agent_chats')
            .update({ needs_attention: false, attention_reason: null })
            .eq('id', msg.chat_id)

        // Humanized delay (1.2s + 55ms/char, capped 8s) then send via the
        // shared core (also used by autopilot).
        await new Promise((r) => setTimeout(r, Math.min(1200 + 55 * text.length, 8000)))
        const result = await sendAgentMessage(messageId)
        if (!result.success) return { success: false, error: `Send failed: ${result.error}` }

        const { data: updated } = await supabase
            .from('agent_messages')
            .select('*')
            .eq('id', messageId)
            .single()
        return { success: true, data: toMessageDTO(updated as AgentMessageRow) }
    } catch (e) {
        return fail(e)
    }
}

export async function getAutopilotConfig(avatarId: string): Promise<InboxResult<AutopilotConfig>> {
    try {
        const ctx = await getOrgContext()
        const supabase = agentSupabase()
        const { data } = await supabase
            .from('avatar_personas')
            .select('autopilot')
            .eq('organization_id', ctx.organizationId)
            .eq('avatar_id', avatarId)
            .maybeSingle()
        return { success: true, data: (data?.autopilot ?? {}) as AutopilotConfig }
    } catch (e) {
        return fail(e)
    }
}

export async function setAutopilotConfig(
    avatarId: string,
    config: AutopilotConfig,
): Promise<InboxResult<AutopilotConfig>> {
    try {
        const ctx = await getOrgContext()
        const supabase = agentSupabase()
        const { error } = await supabase
            .from('avatar_personas')
            .update({ autopilot: config as never, updated_at: new Date().toISOString() })
            .eq('organization_id', ctx.organizationId)
            .eq('avatar_id', avatarId)
        if (error) throw new Error(error.message)
        return { success: true, data: config }
    } catch (e) {
        return fail(e)
    }
}

/** Map an avatar to a Fanvue creator (agency) or its own account (null = self). */
export async function setAvatarFanvueCreator(
    avatarId: string,
    creatorUuid: string | null,
): Promise<InboxResult<{ avatarId: string; creatorUuid: string | null }>> {
    try {
        const ctx = await getOrgContext()
        const supabase = agentSupabase()
        const { data: avatar } = await supabase
            .from('avatars')
            .select('user_id')
            .eq('id', avatarId)
            .maybeSingle()
        if (!avatar || (avatar.user_id && avatar.user_id !== ctx.userId)) {
            return { success: false, error: 'Not your avatar' }
        }
        const { error } = await supabase
            .from('avatars')
            .update({ fanvue_creator_uuid: creatorUuid })
            .eq('id', avatarId)
        if (error) throw new Error(error.message)
        return { success: true, data: { avatarId, creatorUuid } }
    } catch (e) {
        return fail(e)
    }
}

/**
 * Approve a draft and send it as a VOICE NOTE in the avatar's cloned voice
 * (MiniMax TTS → Fanvue audio media). Requires the avatar to have a ready
 * default voice.
 */
export async function approveAndSendVoiceNote(
    messageId: string,
    editedText?: string,
): Promise<InboxResult<AgentMessageDTO>> {
    try {
        const ctx = await getOrgContext()
        const supabase = agentSupabase()
        const { data: msg } = await supabase
            .from('agent_messages')
            .select('*')
            .eq('organization_id', ctx.organizationId)
            .eq('id', messageId)
            .maybeSingle()
        if (!msg) return { success: false, error: 'Draft not found' }
        if (msg.status !== 'draft') return { success: false, error: `Cannot send a ${msg.status} message` }
        const text = (editedText ?? msg.text ?? '').trim()
        if (!text) return { success: false, error: 'Message is empty' }

        const { data: chat } = await supabase
            .from('agent_chats')
            .select('*')
            .eq('id', msg.chat_id)
            .single()
        if (!chat) return { success: false, error: 'Chat not found' }

        const { data: avatar } = await supabase
            .from('avatars')
            .select('user_id, fanvue_creator_uuid, default_voice_id')
            .eq('id', chat.avatar_id)
            .single()
        if (!avatar?.user_id) return { success: false, error: 'Avatar has no owner' }
        if (!avatar.default_voice_id) {
            return { success: false, error: 'This avatar has no voice — clone one in Voice Studio and set it as default' }
        }
        const { data: voice } = await supabase
            .from('cloned_voices')
            .select('provider_voice_id, tts_settings, language, status')
            .eq('id', avatar.default_voice_id)
            .maybeSingle()
        if (!voice || voice.status !== 'ready') {
            return { success: false, error: 'The avatar voice is not ready yet' }
        }
        const connection = await loadConnection(avatar.user_id)
        if (!connection) return { success: false, error: 'Fanvue not connected' }

        // Approve, then synthesize + upload + send.
        await supabase
            .from('agent_messages')
            .update({ status: 'approved', approved_by: ctx.userId, text, updated_at: new Date().toISOString() })
            .eq('id', messageId)
        await supabase
            .from('agent_chats')
            .update({ needs_attention: false, attention_reason: null })
            .eq('id', chat.id)

        const tts = (voice.tts_settings ?? {}) as { speed?: number; pitch?: number; emotion?: string }
        try {
            const { audioBuffer } = await textToSpeech({
                text,
                voiceId: voice.provider_voice_id,
                speed: tts.speed,
                pitch: tts.pitch,
                emotion: tts.emotion as never,
                language: voice.language,
            })
            const bytes = audioBuffer.buffer.slice(
                audioBuffer.byteOffset,
                audioBuffer.byteOffset + audioBuffer.byteLength,
            ) as ArrayBuffer

            const client = makeFanvueClient(avatar.user_id)
            const mediaUuid = await uploadBufferMedia({
                client,
                creatorUuid: avatar.fanvue_creator_uuid ?? null,
                bytes,
                filename: `voice-${Date.now()}.mp3`,
                mediaType: 'audio',
            })
            const res = await client.sendChatMessage(
                avatar.fanvue_creator_uuid ?? null,
                chat.external_chat_id,
                { mediaUuids: [mediaUuid] },
            )
            const { data: updated } = await supabase
                .from('agent_messages')
                .update({
                    status: 'sent',
                    external_message_id: res.messageUuid,
                    media: [{ type: 'audio', mediaUuid }] as never,
                    sent_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq('id', messageId)
                .select('*')
                .single()
            await supabase
                .from('agent_chats')
                .update({ last_message_at: new Date().toISOString() })
                .eq('id', chat.id)
            void updateFanMemoryFromChat(chat.id)
            return { success: true, data: toMessageDTO(updated as AgentMessageRow) }
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e)
            await supabase
                .from('agent_messages')
                .update({ status: 'failed', error_message: message, updated_at: new Date().toISOString() })
                .eq('id', messageId)
            return { success: false, error: `Voice note failed: ${message}` }
        }
    } catch (e) {
        return fail(e)
    }
}

export interface PpvSuggestion {
    generationId: string
    storagePath: string
    mediaType: 'IMAGE' | 'VIDEO'
    previewUrl: string
    teaser: string
    priceCents: number
}

/**
 * Suggest a PPV offer for a chat: retrieve the avatar's own media (indexed
 * knowledge kind='media'), let the LLM pick the most fitting piece for the
 * conversation and write a teaser + price. Returns a preview the operator
 * confirms before sending. Requires the avatar's content to be reindexed
 * (Knowledge tab) so media has storage paths.
 */
export async function suggestPpvOffer(chatId: string): Promise<InboxResult<PpvSuggestion>> {
    try {
        const ctx = await getOrgContext()
        const supabase = agentSupabase()
        const { data: chat } = await supabase
            .from('agent_chats')
            .select('*')
            .eq('organization_id', ctx.organizationId)
            .eq('id', chatId)
            .maybeSingle()
        if (!chat) return { success: false, error: 'Chat not found' }

        const { data: lastFan } = await supabase
            .from('agent_messages')
            .select('text')
            .eq('chat_id', chatId)
            .eq('direction', 'in')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        const query = lastFan?.text ?? 'exclusive content'

        // Media pieces the avatar can actually send.
        const chunks = await retrieveKnowledge(chat.avatar_id, query, { matchCount: 12, minSimilarity: 0.1 })
        const mediaCandidates = chunks
            .filter((c) => c.kind === 'media' && c.metadata?.storage_path && c.metadata?.generation_id)
            .slice(0, 6)
        if (mediaCandidates.length === 0) {
            return {
                success: false,
                error: 'No sendable media indexed for this avatar — hit “Reindex avatar content” on its Knowledge tab first',
            }
        }

        const apiKey = process.env.GEMINI_API_KEY
        if (!apiKey) return { success: false, error: 'GEMINI_API_KEY not configured' }
        const ai = new GoogleGenAI({ apiKey })
        const list = mediaCandidates
            .map((c, i) => `${i}: [${c.metadata?.media_type}] ${c.content}`)
            .join('\n')
        const res = await ai.models.generateContent({
            model: AGENT_UTILITY_MODEL,
            contents: [
                {
                    role: 'user',
                    parts: [
                        {
                            text:
                                'A fan is chatting with a creator. Pick the ONE media piece below that best fits ' +
                                'as a pay-per-view offer for this conversation, write a short flirty teaser caption ' +
                                '(1-2 sentences) that sells it without revealing everything, and suggest a price in ' +
                                'US cents (integer, minimum 300, typical 500-2500 depending on how hot it is).\n\n' +
                                `FAN'S LAST MESSAGE: ${query}\n\nMEDIA OPTIONS:\n${list}`,
                        },
                    ],
                },
            ],
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        index: { type: Type.NUMBER },
                        teaser: { type: Type.STRING },
                        priceCents: { type: Type.NUMBER },
                    },
                    required: ['index', 'teaser', 'priceCents'],
                },
            },
        })
        const parsed = JSON.parse(res.text ?? '{}') as { index?: number; teaser?: string; priceCents?: number }
        const chosen = mediaCandidates[Math.min(Math.max(0, parsed.index ?? 0), mediaCandidates.length - 1)]
        const storagePath = String(chosen.metadata?.storage_path)
        const mediaType = (chosen.metadata?.media_type === 'VIDEO' ? 'VIDEO' : 'IMAGE') as 'IMAGE' | 'VIDEO'

        return {
            success: true,
            data: {
                generationId: String(chosen.metadata?.generation_id),
                storagePath,
                mediaType,
                previewUrl: getStoragePublicUrl('generations', storagePath),
                teaser: parsed.teaser ?? 'Got something special for you… 😏',
                priceCents: Math.max(300, Math.round(parsed.priceCents ?? 500)),
            },
        }
    } catch (e) {
        return fail(e)
    }
}

/** Send a PPV offer: upload the chosen generation media and send it locked behind `priceCents`. */
export async function sendPpvOffer(input: {
    chatId: string
    storagePath: string
    mediaType: 'IMAGE' | 'VIDEO'
    text: string
    priceCents: number
}): Promise<InboxResult<{ sent: true }>> {
    try {
        const ctx = await getOrgContext()
        const supabase = agentSupabase()
        const { data: chat } = await supabase
            .from('agent_chats')
            .select('*')
            .eq('organization_id', ctx.organizationId)
            .eq('id', input.chatId)
            .maybeSingle()
        if (!chat) return { success: false, error: 'Chat not found' }
        if (input.priceCents < 300) return { success: false, error: 'Price must be at least 300 cents' }

        const { data: avatar } = await supabase
            .from('avatars')
            .select('user_id, fanvue_creator_uuid')
            .eq('id', chat.avatar_id)
            .single()
        if (!avatar?.user_id) return { success: false, error: 'Avatar has no owner' }
        const connection = await loadConnection(avatar.user_id)
        if (!connection) return { success: false, error: 'Fanvue not connected' }

        const client = makeFanvueClient(avatar.user_id)
        const mediaUuid = await uploadGenerationMedia({
            client,
            creatorUuid: avatar.fanvue_creator_uuid ?? null,
            storagePath: input.storagePath,
            mediaType: input.mediaType === 'VIDEO' ? 'video' : 'image',
            supabase: supabase as unknown as Parameters<typeof uploadGenerationMedia>[0]['supabase'],
        })
        const res = await client.sendChatMessage(avatar.fanvue_creator_uuid ?? null, chat.external_chat_id, {
            text: input.text || undefined,
            mediaUuids: [mediaUuid],
            price: input.priceCents,
        })

        await supabase.from('agent_messages').insert({
            organization_id: chat.organization_id,
            chat_id: chat.id,
            direction: 'out',
            external_message_id: res.messageUuid,
            text: input.text,
            media: [{ type: input.mediaType.toLowerCase(), mediaUuid, price: input.priceCents }] as never,
            status: 'sent',
            approved_by: ctx.userId,
            sent_at: new Date().toISOString(),
        })
        await supabase
            .from('agent_chats')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', chat.id)
        return { success: true, data: { sent: true } }
    } catch (e) {
        return fail(e)
    }
}

/** Pull recent chats/messages for an avatar from Fanvue into the inbox (button + first import). */
export async function syncFanvueInbox(avatarId: string): Promise<InboxResult<{ chats: number; messages: number }>> {
    try {
        const ctx = await getOrgContext()
        const supabase = agentSupabase()
        // avatars isn't org-scoped until Phase 4 — gate on ownership for now.
        const { data: avatarRow } = await supabase
            .from('avatars')
            .select('user_id, fanvue_creator_uuid')
            .eq('id', avatarId)
            .maybeSingle()
        const ownerUserId = avatarRow?.user_id
        if (!ownerUserId || ownerUserId !== ctx.userId) {
            return { success: false, error: 'Not your avatar' }
        }
        const connection = await loadConnection(ownerUserId)
        if (!connection) return { success: false, error: 'Fanvue account not connected' }

        const creatorUuid = avatarRow?.fanvue_creator_uuid ?? null
        const target = await resolveTargetAvatar(ownerUserId, creatorUuid, connection.fanvueAccountUuid)
        if (!target) return { success: false, error: 'Could not resolve avatar target' }

        const client = makeFanvueClient(ownerUserId)
        const creatorSideUuids = new Set<string>(
            [creatorUuid, connection.fanvueAccountUuid].filter((v): v is string => Boolean(v)),
        )

        const chatsRes = await client.listChats(creatorUuid, { page: 1, size: 25 })
        let chatCount = 0
        let msgCount = 0
        for (const summary of chatsRes.data) {
            const chat = await upsertChat({
                target,
                fanUuid: summary.user.uuid,
                fanDisplayName: summary.user.displayName ?? summary.user.handle,
                fanHandle: summary.user.handle,
                fanAvatarUrl: summary.user.avatarUrl ?? null,
                isCreator: Boolean(summary.isCreator),
                lastMessageAt: summary.lastMessageAt,
                lastFanMessageAt:
                    summary.lastMessage && !creatorSideUuids.has(summary.lastMessage.senderUuid)
                        ? summary.lastMessage.sentAt
                        : null,
            })
            chatCount++

            const messagesRes = await client.listChatMessages(creatorUuid, summary.user.uuid, {
                page: 1,
                size: 20,
                markAsRead: false,
            })
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
                if (inserted) msgCount++
            }

            // Draft for chats whose latest message is from the fan, if enabled.
            const latest = messagesRes.data[messagesRes.data.length - 1]
            if (
                target.personaEnabled &&
                chat.mode !== 'off' &&
                latest &&
                messageDirection(latest, creatorSideUuids) === 'in'
            ) {
                try {
                    await generateDraftReply(chat.id)
                } catch (e) {
                    console.warn('[syncFanvueInbox] draft failed', e)
                }
            }
        }
        return { success: true, data: { chats: chatCount, messages: msgCount } }
    } catch (e) {
        return fail(e)
    }
}
