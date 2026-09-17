/**
 * Draft-reply pipeline: history + persona + RAG + fan memory → an editable
 * draft the human approves. Max ONE draft per chat (regenerate replaces it).
 *
 * F4.2 Tarea 4 — EXENTO de `orgTable`: lo llaman el webhook y el cron (sin
 * sesión) además del Inbox. La fila del chat es la que RESUELVE la org (su id
 * lo trae el llamador de su propia ingesta) y todo lo demás —persona, avatar,
 * historial, memoria del fan, borrador— filtra ya por `chat.organization_id`.
 */
import { generateText, type ModelMessage } from 'ai'
import { GoogleGenAI, Type } from '@google/genai'
import { agentSupabase, type AvatarPersonaRow } from './db'
import { getChatModel } from './chatProvider'
import { buildSystemPrompt, type BuildSystemPromptInput } from './promptBuilder'
import { fanMemoryPlatform } from './fanMemoryPlatform'
import { promptChannelFor } from './channelRouting'
import { toPersonaDTO } from './personaMapper'
import { retrieveKnowledge } from './retrieval'
import { AGENT_UTILITY_MODEL } from './models'
import { commenterIdFromChat, platformFromChat } from '@/lib/social/comments/ids'
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
        .eq('organization_id', chat.organization_id)
        .eq('avatar_id', chat.avatar_id)
        .maybeSingle()
    if (!personaRow) return null
    const persona = toPersonaDTO(personaRow as AvatarPersonaRow)

    const { data: avatar } = await supabase
        .from('avatars')
        .select('name')
        .eq('organization_id', chat.organization_id)
        .eq('id', chat.avatar_id)
        .maybeSingle()

    // History (oldest→newest); fan 'in' = user, our sent 'out' = assistant.
    const { data: history } = await supabase
        .from('agent_messages')
        .select('direction, text, status, created_at')
        .eq('organization_id', chat.organization_id)
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

    const promptChannel = promptChannelFor(chat.platform)

    // RAG + fan memory
    let ragChunks: RetrievedChunk[]
    if (promptChannel === 'social_comment') {
        // Ruling de la revisión final (I4): el conocimiento privado del avatar
        // (`avatar_knowledge`) NO se inyecta en una respuesta PÚBLICA — lo que
        // se escribe bajo un post lo lee cualquiera, y ese material está ahí
        // para conversaciones privadas de pago. Aquí la persona habla sólo
        // desde su perfil público y desde el post.
        ragChunks = []
    } else {
        try {
            ragChunks = await retrieveKnowledge(chat.avatar_id, lastFanText)
        } catch {
            ragChunks = []
        }
    }
    // `commenterIdFromChat` es identidad para Fanvue/Telegram (su
    // `external_chat_id` nunca trae ':') y extrae al comentarista para
    // `social:*` (`'<postId>:<commenterId>'`) — la memoria de un fan social
    // es POR PERSONA, no por post: el mismo comentarista en dos posts
    // distintos es el mismo fan.
    const { data: memory } = await supabase
        .from('avatar_fan_memories')
        .select('summary, facts')
        .eq('organization_id', chat.organization_id)
        .eq('avatar_id', chat.avatar_id)
        .eq('platform', fanMemoryPlatform(chat.platform))
        .eq('external_fan_id', commenterIdFromChat(chat.external_chat_id))
        .maybeSingle()

    // Catálogo de Telegram, SÓLO para ese canal: el prompt le dice a la
    // persona qué contenido tiene —exclusivo de pago y teasers gratis— para
    // que provoque interés sin inventar títulos ni precios. Fanvue y los
    // comentarios sociales no cambian (su venta, si la hay, va por otro
    // camino). Filtrado por organización de la fila ya resuelta.
    //
    // UNA sola consulta para las dos listas: `is_free` las separa aquí. Dos
    // consultas con el mismo filtro serían dos viajes para el mismo dato.
    let paidCatalog: { title: string; stars: number }[] | undefined
    let freeCatalog: { title: string }[] | undefined
    if (promptChannel === 'telegram') {
        const { data: items, error: itemsError } = await supabase
            .from('telegram_paid_media_items')
            .select('title, star_price, is_free')
            .eq('organization_id', chat.organization_id)
            .eq('avatar_id', chat.avatar_id)
            .eq('enabled', true)
            // Los gratis PRIMERO: el `limit` es un tope común a las dos listas
            // y el catálogo gratis suele ser mucho más corto. Con el orden
            // sólo por `sort_order`, un catálogo de pago largo podía comerse
            // el tope entero y dejar al prompt sin teasers que enseñar.
            .order('is_free', { ascending: false })
            .order('sort_order', { ascending: true })
            .limit(40)
        // Un fallo aquí NO corta el borrador —se responde igual, sólo que sin
        // mencionar el contenido exclusivo—, pero tiene que dejar rastro: sin
        // esto, "el agente dejó de vender" es indistinguible de "el agente
        // decidió no vender", y nadie sabría dónde mirar.
        if (itemsError) {
            console.error('[agent] catálogo de Telegram no disponible para el prompt', { chatId }, itemsError)
        }
        paidCatalog = (items ?? [])
            .filter((i) => !i.is_free)
            .map((i) => ({ title: i.title, stars: i.star_price }))
        freeCatalog = (items ?? []).filter((i) => i.is_free).map((i) => ({ title: i.title }))
    }

    // Contexto del post bajo el que se comenta — sólo para `social_comment`.
    // `chat.context` es `{ socialPostTargetId, platformPostId, postUrl,
    // caption }` (Tarea 1); aquí sólo interesan caption/postUrl/la red.
    let postContext: BuildSystemPromptInput['postContext']
    if (promptChannel === 'social_comment') {
        const context = (chat.context ?? {}) as { caption?: string | null; postUrl?: string | null }
        postContext = {
            platform: platformFromChat(chat.platform) ?? 'social media',
            caption: context.caption ?? null,
            postUrl: context.postUrl ?? null,
        }
    }

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
        channel: promptChannel,
        paidCatalog,
        freeCatalog,
        postContext,
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
        .eq('organization_id', chat.organization_id)
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
            .select('organization_id, avatar_id, external_chat_id, fan_display_name, platform')
            .eq('id', chatId)
            .maybeSingle()
        if (!chat) return

        const { data: recent } = await supabase
            .from('agent_messages')
            .select('direction, text')
            .eq('organization_id', chat.organization_id)
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

        // Mismo motivo que en `generateDraftReply`: para `social:*` la
        // memoria es del COMENTARISTA, no del post (`external_chat_id` trae
        // `'<postId>:<commenterId>'`); para Fanvue/Telegram es identidad.
        const commenterId = commenterIdFromChat(chat.external_chat_id)
        const { data: existing } = await supabase
            .from('avatar_fan_memories')
            .select('facts')
            .eq('organization_id', chat.organization_id)
            .eq('avatar_id', chat.avatar_id)
            .eq('platform', fanMemoryPlatform(chat.platform))
            .eq('external_fan_id', commenterId)
            .maybeSingle()
        const mergedFacts = {
            ...((existing?.facts as Record<string, unknown>) ?? {}),
            ...(parsed.facts ?? {}),
        }
        await supabase.from('avatar_fan_memories').upsert(
            {
                organization_id: chat.organization_id,
                avatar_id: chat.avatar_id,
                platform: fanMemoryPlatform(chat.platform),
                external_fan_id: commenterId,
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
