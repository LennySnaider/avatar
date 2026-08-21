/**
 * Provider-agnostic RAG retrieval over avatar_knowledge (pgvector).
 *
 * F4.2 Tarea 4 — EXENTO de `orgTable` por construcción: aquí no hay ningún
 * `.from()`, sólo el RPC `match_avatar_knowledge`, y `orgTable` sólo sabe
 * pre-scopear tablas. La función SQL filtra sólo por `p_avatar_id` (verificado
 * contra la BD: no acepta parámetro de org), así que el scope real lo pone el
 * llamador, que SIEMPRE valida antes el avatar contra la org —
 * `AgentService.searchKnowledge` vía `getOwnedAvatar`, el playground y el
 * inbox vía `orgTable(ctx,'avatars')`/`agent_chats`. Meterle un `p_org` es
 * cambiar el esquema; queda anotado para la tarea de migraciones.
 */
import { agentSupabase } from './db'
import { embedText } from './embeddings'
import type { RetrievedChunk } from './types'

export interface RetrieveOptions {
    matchCount?: number
    minSimilarity?: number
}

export async function retrieveKnowledge(
    avatarId: string,
    query: string,
    opts: RetrieveOptions = {},
): Promise<RetrievedChunk[]> {
    const text = query.trim()
    if (!text) return []
    const embedding = await embedText(text, 'RETRIEVAL_QUERY')
    const supabase = agentSupabase()
    const { data, error } = await supabase.rpc('match_avatar_knowledge', {
        p_avatar_id: avatarId,
        // pgvector over PostgREST expects the vector serialized as a string.
        p_query_embedding: JSON.stringify(embedding),
        p_match_count: opts.matchCount ?? 6,
        p_min_similarity: opts.minSimilarity ?? 0.3,
    })
    if (error) throw new Error(error.message)
    return (data ?? []).map((row) => ({
        id: row.id,
        kind: row.kind,
        title: row.title,
        content: row.content,
        similarity: row.similarity,
        metadata: (row.metadata ?? {}) as Record<string, unknown>,
    }))
}
