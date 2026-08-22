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
 *
 * F4.2 Tarea 4 — VERIFICADO que esta ruta corre CON sesión: la llama el
 * navegador desde el Playground (`useChat({ api: '/api/agent/chat' })` en
 * agent/[slug]/_components/Playground.tsx) y ya devolvía 401 sin sesión. Por
 * eso NO es una de las rutas exentas (webhook/cron): resuelve `ctx` con
 * `getOrgContext()` y lee por `orgTable`, como cualquier server action.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { convertToModelMessages, streamText, type UIMessage } from 'ai'
import { getOrgContext, type OrgContext } from '@/lib/tenant/getOrgContext'
import { orgTable } from '@/lib/org/orgTable'
import { getChatModel } from '@/lib/agent/chatProvider'
import { buildSystemPrompt } from '@/lib/agent/promptBuilder'
import { toPersonaDTO } from '@/lib/agent/personaMapper'
import { retrieveKnowledge } from '@/lib/agent/retrieval'
import type { AvatarPersonaRow } from '@/lib/agent/db'
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
    // `getOrgContext()` lanza por DOS motivos (sin sesión / sin fila en
    // organization_members). Los dos son "no puedes pasar" en una ruta de API,
    // así que se responde 401 con el mensaje real en vez de dejar que el throw
    // salga como 500 y el playground muestre un error opaco.
    let ctx: OrgContext
    try {
        ctx = await getOrgContext()
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : 'Not authenticated' },
            { status: 401 },
        )
    }

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

    // El chequeo anterior (`avatar.user_id !== userId`) se saltaba entero
    // cuando `user_id` era null: con el id de un avatar ajeno se podía chatear
    // con su persona. El `.eq('organization_id', …)` de orgTable no se salta —
    // fuera de la org el avatar simplemente no existe (404).
    const { data: avatarRow } = await orgTable(ctx, 'avatars')
        .select('id, name')
        .eq('id', avatarId)
        .maybeSingle()
    const avatar = avatarRow as { id: string; name: string } | null
    if (!avatar) return NextResponse.json({ error: 'Avatar not found' }, { status: 404 })

    const { data: personaData } = await orgTable(ctx, 'avatar_personas')
        .select('*')
        .eq('avatar_id', avatarId)
        .maybeSingle()
    const personaRow = personaData as AvatarPersonaRow | null
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
