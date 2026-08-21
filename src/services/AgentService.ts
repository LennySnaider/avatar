'use server'

/**
 * Per-avatar AI agent: persona management + RAG knowledge base.
 * First org-scoped service (Phase 0 pattern): every function opens with
 * getOrgContext() and writes/filters organization_id. The persona's LLM
 * api_key never reaches the client (PersonaDTO carries hasApiKey only).
 *
 * F4.2 Tarea 4 — las 9 llamadas a `agentSupabase()` pasan por la puerta
 * org-scoped (`orgTable`/`orgInsert`/`orgUpsert`), mismo patrón que
 * SocialService.ts (acab85d) y FanvueService.ts (8c1d5f2). Cerraba tres
 * agujeros reales: `getOwnedAvatar` autorizaba con `user_id` (que es null en
 * las filas viejas, así que el chequeo se saltaba entero), y el reindexado
 * leía `generations` sólo por `avatar_id` y `fanvue_posts` sólo por
 * `generation_id` — sin ningún filtro de org.
 */
import { GoogleGenAI, Type } from '@google/genai'
import { getRowMediaUrl, type GenerationMediaRow } from '@/lib/storagePaths'
import { generateText } from 'ai'
import { getOrgContext, type OrgContext } from '@/lib/tenant/getOrgContext'
import { orgTable, orgInsert, orgUpsert } from '@/lib/org/orgTable'
import type { AvatarKnowledgeRow } from '@/lib/agent/db'
import { toPersonaDTO } from '@/lib/agent/personaMapper'
import { getChatModel } from '@/lib/agent/chatProvider'
import { AGENT_UTILITY_MODEL } from '@/lib/agent/models'
import { embedTexts } from '@/lib/agent/embeddings'
import { retrieveKnowledge } from '@/lib/agent/retrieval'
import { sanitizeGenerationPrompt } from '@/lib/agent/indexer'
import type {
    ChatProviderSlug,
    KnowledgeKind,
    KnowledgeItemDTO,
    NsfwLevel,
    PersonaDTO,
    PersonaPersonality,
    ResponseLength,
    ResponseObjective,
    ResponseTone,
    RetrievedChunk,
} from '@/lib/agent/types'

export interface AgentResult<T> {
    success: boolean
    data?: T
    error?: string
}

export interface UpsertPersonaInput {
    avatarId: string
    enabled: boolean
    systemPrompt?: string | null
    backstory?: string | null
    personality?: PersonaPersonality
    writingStyle?: string | null
    boundaries?: string | null
    languages?: string[]
    chatProvider: ChatProviderSlug
    chatModel: string
    /** undefined = keep stored key; '' or null = clear (fall back to env). */
    apiKey?: string | null
    responseTone: ResponseTone
    responseObjective: ResponseObjective
    responseLength: ResponseLength
    nsfwLevel: NsfwLevel
}

const fail = (e: unknown): { success: false; error: string } => ({
    success: false,
    error: e instanceof Error ? e.message : String(e),
})

function toKnowledgeDTO(row: AvatarKnowledgeRow): KnowledgeItemDTO {
    return {
        id: row.id,
        kind: row.kind as KnowledgeKind,
        title: row.title,
        content: row.content,
        sourceRef: row.source_ref,
        hasEmbedding: Boolean(row.embedding),
        createdAt: row.created_at,
    }
}

/**
 * Trae el avatar acotado a la org de la sesión (guarda anti-IDOR).
 *
 * Antes autorizaba con `if (avatar.user_id && avatar.user_id !== ctx.userId)`:
 * ese chequeo se SALTABA ENTERO cuando `user_id` era null (la mayoría de las
 * filas anteriores al multitenant), así que cualquier autenticado podía tocar
 * la persona/knowledge de un avatar ajeno pasando su id. El
 * `.eq('organization_id', ...)` que inyecta `orgTable` no se puede saltar, y
 * dentro de una org `user_id` es sólo "creado por" (ver orgTable.ts).
 */
async function getOwnedAvatar(ctx: OrgContext, avatarId: string): Promise<OwnedAvatar> {
    const { data: avatar, error } = await orgTable(ctx, 'avatars')
        .select('id, name, face_description, measurements, identity_weight')
        .eq('id', avatarId)
        .maybeSingle()
    if (error) throw new Error(error.message)
    if (!avatar) throw new Error('Avatar not found')
    // orgTable devuelve el builder sin tipar (gotcha documentado en
    // orgTable.ts); el cast va aquí, después del guard.
    return avatar as OwnedAvatar
}

interface OwnedAvatar {
    id: string
    name: string
    face_description: string | null
    measurements: unknown
    identity_weight: number | null
}

// ---------------------------------------------------------------------------
// Persona
// ---------------------------------------------------------------------------

export async function getAvatarPersona(avatarId: string): Promise<AgentResult<PersonaDTO | null>> {
    try {
        const ctx = await getOrgContext()
        const { data, error } = await orgTable(ctx, 'avatar_personas')
            .select('*')
            .eq('avatar_id', avatarId)
            .maybeSingle()
        if (error) throw new Error(error.message)
        return { success: true, data: data ? toPersonaDTO(data) : null }
    } catch (e) {
        return fail(e)
    }
}

export async function upsertAvatarPersona(input: UpsertPersonaInput): Promise<AgentResult<PersonaDTO>> {
    try {
        const ctx = await getOrgContext()
        await getOwnedAvatar(ctx, input.avatarId)

        // Sin `organization_id`: lo inyecta `orgUpsert` desde el ctx, nunca
        // desde el cliente.
        const patch: Record<string, unknown> = {
            avatar_id: input.avatarId,
            enabled: input.enabled,
            system_prompt: input.systemPrompt ?? null,
            backstory: input.backstory ?? null,
            personality: (input.personality ?? {}) as never,
            writing_style: input.writingStyle ?? null,
            boundaries: input.boundaries ?? null,
            languages: input.languages?.length ? input.languages : ['en'],
            chat_provider: input.chatProvider,
            chat_model: input.chatModel,
            response_tone: input.responseTone,
            response_objective: input.responseObjective,
            response_length: input.responseLength,
            nsfw_level: input.nsfwLevel,
            updated_at: new Date().toISOString(),
        }
        // undefined = keep current key; '' / null = clear (env fallback).
        if (input.apiKey !== undefined) {
            patch.api_key = input.apiKey?.trim() ? input.apiKey.trim() : null
        }

        // `onConflict: 'avatar_id'` se mantiene: ese índice único existe
        // (verificado en la BD real) — cambiarlo es lo que rompió el connect de
        // Fanvue en 8c1d5f2, no se toca sin comprobarlo.
        const { data, error } = await orgUpsert(ctx, 'avatar_personas', patch as never, {
            onConflict: 'avatar_id',
        })
            .select('*')
            .single()
        if (error) throw new Error(error.message)
        return { success: true, data: toPersonaDTO(data) }
    } catch (e) {
        return fail(e)
    }
}

/**
 * One-click persona bootstrap: Gemini drafts backstory/personality/style from
 * what the avatar already is (name, face description, measurements). Saved
 * with enabled=false so the user reviews before turning it on.
 */
export async function generatePersonaFromAvatar(avatarId: string): Promise<AgentResult<PersonaDTO>> {
    try {
        const ctx = await getOrgContext()
        const avatar = await getOwnedAvatar(ctx, avatarId)

        const apiKey = process.env.GEMINI_API_KEY
        if (!apiKey) throw new Error('GEMINI_API_KEY is not configured')
        const ai = new GoogleGenAI({ apiKey })

        const profileLines = [
            `Name: ${avatar.name}`,
            avatar.face_description ? `Face/appearance: ${avatar.face_description}` : null,
            avatar.measurements ? `Physical profile: ${JSON.stringify(avatar.measurements)}` : null,
        ].filter(Boolean)

        const response = await ai.models.generateContent({
            model: AGENT_UTILITY_MODEL,
            contents: [
                {
                    role: 'user',
                    parts: [
                        {
                            text:
                                'You are designing the chat persona for a virtual influencer / AI companion. ' +
                                'From this profile, invent a coherent, memorable persona. Be specific and human — ' +
                                'no generic filler. Keep the backstory believable (city, job/side-hustle, daily life). ' +
                                'Writing style should describe HOW she texts (length, slang, punctuation, emoji habits). ' +
                                'Boundaries: sensible hard limits for a creator chatting with fans (no meetups, no personal ' +
                                'contact info, no illegal content).\n\nPROFILE:\n' +
                                profileLines.join('\n'),
                        },
                    ],
                },
            ],
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        backstory: { type: Type.STRING },
                        traits: { type: Type.ARRAY, items: { type: Type.STRING } },
                        interests: { type: Type.ARRAY, items: { type: Type.STRING } },
                        quirks: { type: Type.ARRAY, items: { type: Type.STRING } },
                        emojiUsage: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
                        writingStyle: { type: Type.STRING },
                        boundaries: { type: Type.STRING },
                        suggestedTone: {
                            type: Type.STRING,
                            enum: ['flirty', 'friendly', 'dominant', 'sweet', 'mysterious', 'playful'],
                        },
                    },
                    required: ['backstory', 'traits', 'interests', 'writingStyle', 'boundaries'],
                },
            },
        })

        const raw = response.text
        if (!raw) throw new Error('Persona generation returned no content')
        const parsed = JSON.parse(raw) as {
            backstory: string
            traits: string[]
            interests: string[]
            quirks?: string[]
            emojiUsage?: 'low' | 'medium' | 'high'
            writingStyle: string
            boundaries: string
            suggestedTone?: ResponseTone
        }

        // Preserve existing provider/config if the persona already exists.
        const existing = await getAvatarPersona(avatarId)
        const base = existing.success ? existing.data : null

        return upsertAvatarPersona({
            avatarId,
            enabled: false,
            systemPrompt: base?.systemPrompt ?? null,
            backstory: parsed.backstory,
            personality: {
                traits: parsed.traits,
                interests: parsed.interests,
                quirks: parsed.quirks ?? [],
                emojiUsage: parsed.emojiUsage ?? 'medium',
            },
            writingStyle: parsed.writingStyle,
            boundaries: parsed.boundaries,
            languages: base?.languages ?? ['en'],
            chatProvider: base?.chatProvider ?? 'gemini',
            chatModel: base?.chatModel ?? 'gemini-flash-latest',
            responseTone: parsed.suggestedTone ?? base?.responseTone ?? 'flirty',
            responseObjective: base?.responseObjective ?? 'engagement',
            responseLength: base?.responseLength ?? 'medium',
            nsfwLevel: base?.nsfwLevel ?? 'suggestive',
        })
    } catch (e) {
        return fail(e)
    }
}

/** One-sentence smoke test against the persona's saved provider/model/key. */
export async function testPersonaProvider(avatarId: string): Promise<AgentResult<{ reply: string; latencyMs: number }>> {
    try {
        const ctx = await getOrgContext()
        const { data: persona } = await orgTable(ctx, 'avatar_personas')
            .select('*')
            .eq('avatar_id', avatarId)
            .maybeSingle()
        if (!persona) return { success: false, error: 'Save the persona first' }

        const started = Date.now()
        const { text } = await generateText({
            model: getChatModel({
                provider: persona.chat_provider as ChatProviderSlug,
                model: persona.chat_model,
                apiKey: persona.api_key,
            }),
            prompt: 'Reply with one short friendly sentence to confirm you are online.',
        })
        return { success: true, data: { reply: text.trim(), latencyMs: Date.now() - started } }
    } catch (e) {
        return fail(e)
    }
}

// ---------------------------------------------------------------------------
// Knowledge
// ---------------------------------------------------------------------------

export async function listKnowledge(avatarId: string): Promise<AgentResult<KnowledgeItemDTO[]>> {
    try {
        const ctx = await getOrgContext()
        const { data, error } = await orgTable(ctx, 'avatar_knowledge')
            .select('*')
            .eq('avatar_id', avatarId)
            .order('created_at', { ascending: false })
            .limit(500)
        if (error) throw new Error(error.message)
        const items = ((data ?? []) as AvatarKnowledgeRow[]).map(toKnowledgeDTO)
        await attachKnowledgeThumbnails(ctx, items)
        return { success: true, data: items }
    } catch (e) {
        return fail(e)
    }
}

/**
 * Resuelve la miniatura de las entradas que vienen de un post.
 *
 * `source_ref` guarda `social_posts:{id}` (o `fanvue_posts:{id}`), y la imagen
 * no vive ahi: el post apunta a una `generations`, y la generacion tiene el
 * `storage_path`. Sin esto la base de conocimiento era una lista de captions
 * sin cara — imposible saber a que foto pertenece cada una cuando dos
 * comparten texto, que es justo lo que pasa aqui.
 *
 * Va en DOS consultas batched (posts y generaciones), no una por fila: con 500
 * entradas la version ingenua serian 1000 viajes.
 */
async function attachKnowledgeThumbnails(ctx: OrgContext, items: KnowledgeItemDTO[]): Promise<void> {
    // Solo `social_posts`: es lo unico que indexa hoy el reindex, y el cliente
    // tipado rechaza un nombre de tabla dinamico (bien: obliga a declarar de
    // donde se lee en vez de construirlo en tiempo de ejecucion).
    const byPostId = new Map<string, KnowledgeItemDTO[]>()
    for (const it of items) {
        const [table, id] = (it.sourceRef ?? '').split(':')
        if (table !== 'social_posts' || !id) continue
        byPostId.set(id, [...(byPostId.get(id) ?? []), it])
    }
    if (byPostId.size === 0) return

    const { data: posts } = await orgTable(ctx, 'social_posts')
        .select('id, generation_id')
        .in('id', [...byPostId.keys()])

    const genToItems = new Map<string, KnowledgeItemDTO[]>()
    for (const post of (posts ?? []) as { id: string; generation_id: string | null }[]) {
        if (!post.generation_id) continue
        genToItems.set(post.generation_id, [
            ...(genToItems.get(post.generation_id) ?? []),
            ...(byPostId.get(post.id) ?? []),
        ])
    }
    if (genToItems.size === 0) return

    // '*' para que venga `storage_provider` si la migración R2 ya está aplicada
    // (nombrarlo en el select rompería la query si aún no existe).
    const { data: gens } = await orgTable(ctx, 'generations')
        .select('*')
        .in('id', [...genToItems.keys()])

    for (const gen of (gens ?? []) as (GenerationMediaRow & {
        id: string
        media_type: string | null
    })[]) {
        if (!gen.storage_path) continue
        const url = getRowMediaUrl(gen)
        for (const it of genToItems.get(gen.id) ?? []) {
            it.thumbnailUrl = url
            it.thumbnailMediaType = gen.media_type === 'VIDEO' ? 'VIDEO' : 'IMAGE'
        }
    }
}

export async function addKnowledge(input: {
    avatarId: string
    kind: KnowledgeKind
    title?: string
    content: string
}): Promise<AgentResult<KnowledgeItemDTO>> {
    try {
        const ctx = await getOrgContext()
        await getOwnedAvatar(ctx, input.avatarId)
        const content = input.content.trim()
        if (!content) return { success: false, error: 'Content is required' }

        const [embedding] = await embedTexts([content], 'RETRIEVAL_DOCUMENT')
        const { data, error } = await orgInsert(ctx, 'avatar_knowledge', {
            avatar_id: input.avatarId,
            kind: input.kind,
            title: input.title?.trim() || null,
            content,
            embedding: JSON.stringify(embedding),
        })
            .select('*')
            .single()
        if (error) throw new Error(error.message)
        return { success: true, data: toKnowledgeDTO(data as AvatarKnowledgeRow) }
    } catch (e) {
        return fail(e)
    }
}

export async function deleteKnowledge(knowledgeId: string): Promise<AgentResult<{ id: string }>> {
    try {
        const ctx = await getOrgContext()
        const { error } = await orgTable(ctx, 'avatar_knowledge')
            .delete()
            .eq('id', knowledgeId)
        if (error) throw new Error(error.message)
        return { success: true, data: { id: knowledgeId } }
    } catch (e) {
        return fail(e)
    }
}

export async function searchKnowledge(avatarId: string, query: string): Promise<AgentResult<RetrievedChunk[]>> {
    try {
        const ctx = await getOrgContext()
        await getOwnedAvatar(ctx, avatarId)
        const chunks = await retrieveKnowledge(avatarId, query, { matchCount: 8, minSimilarity: 0.15 })
        return { success: true, data: chunks }
    } catch (e) {
        return fail(e)
    }
}

/**
 * Bulk-index the avatar's existing footprint: published captions (social +
 * Fanvue) and generation prompts (kind 'media' — these later power PPV
 * suggestions via metadata.storage_path). Idempotent: rows already indexed by
 * source_ref are skipped, so re-running only embeds what's new.
 */
export async function reindexAvatarContent(avatarId: string): Promise<AgentResult<{ indexed: number; skipped: number }>> {
    try {
        const ctx = await getOrgContext()
        await getOwnedAvatar(ctx, avatarId)

        type Candidate = {
            sourceRef: string
            kind: KnowledgeKind
            title: string | null
            content: string
            metadata: Record<string, unknown>
        }
        const candidates: Candidate[] = []

        // 1. Social captions (posts published through this avatar's Upload-Post profile)
        const { data: profiles } = await orgTable(ctx, 'social_profiles')
            .select('id')
            .eq('avatar_id', avatarId)
        const profileIds = ((profiles ?? []) as { id: string }[]).map((p) => p.id)
        if (profileIds.length > 0) {
            const { data: posts } = await orgTable(ctx, 'social_posts')
                .select('id, caption')
                .in('social_profile_id', profileIds)
                .order('created_at', { ascending: false })
                .limit(200)
            for (const post of (posts ?? []) as { id: string; caption: string | null }[]) {
                if (!post.caption?.trim()) continue
                candidates.push({
                    sourceRef: `social_posts:${post.id}`,
                    kind: 'post',
                    title: 'Social post',
                    content: post.caption.trim(),
                    metadata: {},
                })
            }
        }

        // 2. Generations: prompt (sanitized) as media knowledge + Fanvue captions via generation ids
        // Antes filtraba SÓLO por `avatar_id`: con ids de avatar de otra org
        // (o si dos orgs comparten un avatar heredado) se indexaba contenido
        // ajeno dentro del knowledge de este avatar. `orgTable` lo acota.
        const { data: gens } = await orgTable(ctx, 'generations')
            .select('id, prompt, media_type, storage_path')
            .eq('avatar_id', avatarId)
            .order('created_at', { ascending: false })
            .limit(200)
        type GenRow = {
            id: string
            prompt: string | null
            media_type: string | null
            storage_path: string
        }
        const genRows = (gens ?? []) as GenRow[]
        const genIds = genRows.map((g) => g.id)
        for (const gen of genRows) {
            const cleaned = sanitizeGenerationPrompt(gen.prompt ?? '')
            if (!cleaned) continue
            candidates.push({
                sourceRef: `generations:${gen.id}`,
                kind: 'media',
                title: gen.media_type === 'VIDEO' ? 'Video in my gallery' : 'Photo in my gallery',
                content: cleaned,
                metadata: { storage_path: gen.storage_path, media_type: gen.media_type, generation_id: gen.id },
            })
        }
        if (genIds.length > 0) {
            // Igual que arriba: `generation_id` solo no acota nada — el filtro
            // de org va en la propia consulta, no en un `if` posterior.
            const { data: fanvuePosts } = await orgTable(ctx, 'fanvue_posts')
                .select('id, caption, generation_id')
                .in('generation_id', genIds)
                .limit(200)
            for (const post of (fanvuePosts ?? []) as {
                id: string
                caption: string | null
            }[]) {
                if (!post.caption?.trim()) continue
                candidates.push({
                    sourceRef: `fanvue_posts:${post.id}`,
                    kind: 'post',
                    title: 'Fanvue post',
                    content: post.caption.trim(),
                    metadata: {},
                })
            }
        }

        if (candidates.length === 0) return { success: true, data: { indexed: 0, skipped: 0 } }

        // Skip already-indexed sources (avoid re-embedding cost)
        const { data: existing } = await orgTable(ctx, 'avatar_knowledge')
            .select('source_ref')
            .eq('avatar_id', avatarId)
            .not('source_ref', 'is', null)
        const existingRefs = new Set(
            ((existing ?? []) as { source_ref: string | null }[]).map((r) => r.source_ref),
        )
        const fresh = candidates.filter((c) => !existingRefs.has(c.sourceRef))
        const skipped = candidates.length - fresh.length
        if (fresh.length === 0) return { success: true, data: { indexed: 0, skipped } }

        const embeddings = await embedTexts(
            fresh.map((c) => c.content),
            'RETRIEVAL_DOCUMENT',
        )
        // Sin `organization_id` en las filas: lo inyecta `orgUpsert`.
        const rows = fresh.map((c, i) => ({
            avatar_id: avatarId,
            kind: c.kind,
            title: c.title,
            content: c.content,
            embedding: JSON.stringify(embeddings[i]),
            metadata: c.metadata as never,
            source_ref: c.sourceRef,
        }))
        const { error: insErr } = await orgUpsert(ctx, 'avatar_knowledge', rows as never, {
            onConflict: 'avatar_id,source_ref',
        })
        if (insErr) throw new Error(insErr.message)

        return { success: true, data: { indexed: fresh.length, skipped } }
    } catch (e) {
        return fail(e)
    }
}
