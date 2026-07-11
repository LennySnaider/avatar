/**
 * Draft-reply pipeline: history + persona + RAG + fan memory → an editable
 * draft the human approves. Max ONE draft per chat (regenerate replaces it).
 */
import { generateText, type ModelMessage } from 'ai'
import { GoogleGenAI, Type } from '@google/genai'
import { agentSupabase, type AvatarPersonaRow } from './db'
import { getChatModel } from './chatProvider'
import { buildSystemPrompt } from './promptBuilder'
import { toPersonaDTO } from './personaMapper'
import { retrieveKnowledge } from './retrieval'
import { AGENT_UTILITY_MODEL } from './models'
import type { RetrievedChunk } from './types'

const HISTORY_LIMIT = 20

export interface DraftResult {
    messageId: string
    text: string
}

/**
 * Generate the draft reply for a chat (regeneration just calls again — the
 * existing draft is always replaced). Assumes the persona is enabled and the
 * chat mode isn't 'off' (callers gate that). Returns null if there's nothing
 * to reply to or the persona is missing.
 */
export async function generateDraftReply(chatId: string): Promise<DraftResult | null> {
    const supabase = agentSupabase()

    const { data: chat } = await supabase
        .from('agent_chats')
        .select('*')
        .eq('id', chatId)
        .maybeSingle()
    if (!chat) return null

    const { data: personaRow } = await supabase
        .from('avatar_personas')
        .select('*')
        .eq('avatar_id', chat.avatar_id)
        .maybeSingle()
    if (!personaRow) return null
    const persona = toPersonaDTO(personaRow as AvatarPersonaRow)

    const { data: avatar } = await supabase
        .from('avatars')
        .select('name')
        .eq('id', chat.avatar_id)
        .maybeSingle()

    // History (oldest→newest); fan 'in' = user, our sent 'out' = assistant.
    const { data: history } = await supabase
        .from('agent_messages')
        .select('direction, text, status, created_at')
        .eq('chat_id', chatId)
        .in('status', ['received', 'sent'])
        .order('created_at', { ascending: false })
        .limit(HISTORY_LIMIT)
    const ordered = (history ?? []).slice().reverse()
    const lastFanText = [...ordered].reverse().find((m) => m.direction === 'in')?.text ?? ''
    if (!lastFanText.trim()) return null

    const messages: ModelMessage[] = ordered
        .filter((m) => m.text?.trim())
        .map((m) => ({
            role: m.direction === 'in' ? 'user' : 'assistant',
            content: m.text as string,
        }))

    // RAG + fan memory
    let ragChunks: RetrievedChunk[]
    try {
        ragChunks = await retrieveKnowledge(chat.avatar_id, lastFanText)
    } catch {
        ragChunks = []
    }
    const { data: memory } = await supabase
        .from('avatar_fan_memories')
        .select('summary, facts')
        .eq('avatar_id', chat.avatar_id)
        .eq('platform', 'fanvue')
        .eq('external_fan_id', chat.external_chat_id)
        .maybeSingle()

    const system = buildSystemPrompt({
        persona,
        avatarName: avatar?.name ?? 'the creator',
        ragChunks,
        fanMemory: memory
            ? {
                  summary: memory.summary,
                  facts: (memory.facts ?? {}) as Record<string, string>,
              }
            : null,
        channel: 'fanvue',
    })

    const { text } = await generateText({
        model: getChatModel({
            provider: persona.chatProvider,
            model: persona.chatModel,
            apiKey: personaRow.api_key,
        }),
        system,
        messages,
    })
    const draftText = text.trim()
    if (!draftText) return null

    // One draft per chat: replace any existing draft.
    await supabase
        .from('agent_messages')
        .delete()
        .eq('chat_id', chatId)
        .eq('status', 'draft')

    const { data: row, error } = await supabase
        .from('agent_messages')
        .insert({
            organization_id: chat.organization_id,
            chat_id: chatId,
            direction: 'out',
            text: draftText,
            status: 'draft',
            generated_by: { provider: persona.chatProvider, model: persona.chatModel } as never,
        })
        .select('id')
        .single()
    if (error) throw new Error(error.message)
    return { messageId: row.id, text: draftText }
}

/**
 * Refresh a fan's memory (facts + rolling summary) from recent messages.
 * Fire-and-forget; a cheap model, structured output. Never throws to callers.
 */
export async function updateFanMemoryFromChat(chatId: string): Promise<void> {
    try {
        const supabase = agentSupabase()
        const { data: chat } = await supabase
            .from('agent_chats')
            .select('organization_id, avatar_id, external_chat_id, fan_display_name')
            .eq('id', chatId)
            .maybeSingle()
        if (!chat) return

        const { data: recent } = await supabase
            .from('agent_messages')
            .select('direction, text')
            .eq('chat_id', chatId)
            .in('status', ['received', 'sent'])
            .order('created_at', { ascending: false })
            .limit(12)
        const convo = (recent ?? [])
            .slice()
            .reverse()
            .filter((m) => m.text?.trim())
            .map((m) => `${m.direction === 'in' ? 'Fan' : 'Creator'}: ${m.text}`)
            .join('\n')
        if (!convo) return

        const apiKey = process.env.GEMINI_API_KEY
        if (!apiKey) return
        const ai = new GoogleGenAI({ apiKey })
        const res = await ai.models.generateContent({
            model: AGENT_UTILITY_MODEL,
            contents: [
                {
                    role: 'user',
                    parts: [
                        {
                            text:
                                'Extract durable facts about the FAN (name, location, job, likes, ' +
                                'important dates, what they bought) and a 1-2 sentence rolling summary ' +
                                'of the relationship. Only include things clearly stated.\n\n' + convo,
                        },
                    ],
                },
            ],
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        facts: {
                            type: Type.OBJECT,
                            properties: {},
                            // free-form key/value map of fan facts
                        },
                        summary: { type: Type.STRING },
                    },
                },
            },
        })
        const raw = res.text
        if (!raw) return
        const parsed = JSON.parse(raw) as { facts?: Record<string, unknown>; summary?: string }

        const { data: existing } = await supabase
            .from('avatar_fan_memories')
            .select('facts')
            .eq('avatar_id', chat.avatar_id)
            .eq('platform', 'fanvue')
            .eq('external_fan_id', chat.external_chat_id)
            .maybeSingle()
        const mergedFacts = {
            ...((existing?.facts as Record<string, unknown>) ?? {}),
            ...(parsed.facts ?? {}),
        }
        await supabase.from('avatar_fan_memories').upsert(
            {
                organization_id: chat.organization_id,
                avatar_id: chat.avatar_id,
                platform: 'fanvue',
                external_fan_id: chat.external_chat_id,
                display_name: chat.fan_display_name ?? null,
                facts: mergedFacts as never,
                summary: parsed.summary ?? null,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'avatar_id,platform,external_fan_id' },
        )
    } catch (e) {
        console.warn('[agent] updateFanMemoryFromChat failed (non-fatal)', e)
    }
}
