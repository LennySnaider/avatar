/** Provider-agnostic RAG retrieval over avatar_knowledge (pgvector). */
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
