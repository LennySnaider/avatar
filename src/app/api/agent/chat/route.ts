/**
 * POST /api/agent/chat — streaming chat playground for an avatar's agent.
 *
 * Route handler (not a server action) because the AI SDK streams UI messages
 * over SSE. Body: { avatarId, messages: UIMessage[] }. RAG context is
 * retrieved from the last user message and injected into the system prompt;
 * the chunks used travel back as message metadata so the UI can show them.
 *
 * The playground works even when the persona is disabled (enabled=false) —
 * that flag gates CHANNELS (Fanvue inbox), not testing.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { convertToModelMessages, streamText, type UIMessage } from 'ai'
import { auth } from '@/auth'
import { agentSupabase } from '@/lib/agent/db'
import { getChatModel } from '@/lib/agent/chatProvider'
import { buildSystemPrompt } from '@/lib/agent/promptBuilder'
import { toPersonaDTO } from '@/lib/agent/personaMapper'
import { retrieveKnowledge } from '@/lib/agent/retrieval'
import type { RetrievedChunk } from '@/lib/agent/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface ChatRequestBody {
    avatarId?: string
    messages?: UIMessage[]
}

function lastUserText(messages: UIMessage[]): string {
    for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i]
        if (m.role !== 'user') continue
        return m.parts
            .map((p) => (p.type === 'text' ? p.text : ''))
            .join(' ')
            .trim()
    }
    return ''
}

export async function POST(req: NextRequest) {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    let body: ChatRequestBody
    try {
        body = (await req.json()) as ChatRequestBody
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const { avatarId, messages } = body
    if (!avatarId || !Array.isArray(messages) || messages.length === 0) {
        return NextResponse.json({ error: 'avatarId and messages are required' }, { status: 400 })
    }

    const supabase = agentSupabase()
    const { data: avatar } = await supabase
        .from('avatars')
        .select('id, name, user_id')
        .eq('id', avatarId)
        .maybeSingle()
    if (!avatar) return NextResponse.json({ error: 'Avatar not found' }, { status: 404 })
    if (avatar.user_id && avatar.user_id !== userId) {
        return NextResponse.json({ error: 'Not your avatar' }, { status: 403 })
    }

    const { data: personaRow } = await supabase
        .from('avatar_personas')
        .select('*')
        .eq('avatar_id', avatarId)
        .maybeSingle()
    if (!personaRow) {
        return NextResponse.json(
            { error: 'This avatar has no persona yet — create one in the Persona tab first' },
            { status: 404 },
        )
    }

    const persona = toPersonaDTO(personaRow)

    // RAG is best-effort in the playground — an embeddings hiccup must not
    // kill the chat, just degrade it to persona-only.
    let ragChunks: RetrievedChunk[] = []
    try {
        const query = lastUserText(messages)
        if (query) ragChunks = await retrieveKnowledge(avatarId, query)
    } catch (e) {
        console.warn('[agent chat] retrieval failed (continuing without RAG)', e)
    }

    let model
    try {
        model = getChatModel({
            provider: persona.chatProvider,
            model: persona.chatModel,
            apiKey: personaRow.api_key,
        })
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : 'Chat provider not configured' },
            { status: 400 },
        )
    }

    const result = streamText({
        model,
        system: buildSystemPrompt({
            persona,
            avatarName: avatar.name,
            ragChunks,
            channel: 'playground',
        }),
        messages: await convertToModelMessages(messages),
    })

    const retrieval = ragChunks.map((c) => ({
        title: c.title,
        kind: c.kind,
        similarity: Number(c.similarity.toFixed(3)),
    }))

    return result.toUIMessageStreamResponse({
        messageMetadata: ({ part }) => (part.type === 'start' ? { retrieval } : undefined),
        onError: (error) => (error instanceof Error ? error.message : 'The model failed to answer'),
    })
}
