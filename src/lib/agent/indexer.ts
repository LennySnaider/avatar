/**
 * Knowledge indexing. Auto-index runs as fire-and-forget hooks from the
 * posting services (no DB triggers with HTTP calls); bulk reindex lives in
 * AgentService.reindexAvatarContent.
 */
import { agentSupabase } from './db'
import { embedText } from './embeddings'
import type { KnowledgeKind } from './types'

export interface IndexKnowledgeInput {
    organizationId: string
    avatarId: string
    kind: KnowledgeKind
    content: string
    title?: string | null
    /** e.g. 'social_posts:<id>' — dedupe key for idempotent reindex. */
    sourceRef: string
    metadata?: Record<string, unknown>
}

/**
 * Upsert + embed one knowledge item. Never throws — indexing must not break
 * the flow that triggered it (posting, generating). Callers use `void`.
 */
export async function indexKnowledgeSource(input: IndexKnowledgeInput): Promise<void> {
    try {
        const content = input.content.trim()
        if (!content) return
        const embedding = await embedText(content, 'RETRIEVAL_DOCUMENT')
        const supabase = agentSupabase()
        const { error } = await supabase
            .from('avatar_knowledge')
            .upsert(
                {
                    organization_id: input.organizationId,
                    avatar_id: input.avatarId,
                    kind: input.kind,
                    title: input.title ?? null,
                    content,
                    embedding: JSON.stringify(embedding),
                    metadata: (input.metadata ?? {}) as never,
                    source_ref: input.sourceRef,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'avatar_id,source_ref' },
            )
        if (error) throw new Error(error.message)
    } catch (e) {
        console.warn('[agent indexer] indexKnowledgeSource failed (non-fatal)', input.sourceRef, e)
    }
}

/**
 * Generation prompts are harness text ([BODY]/[FACE] blocks, camera params…)
 * — strip the scaffolding so only the human-readable scene survives as
 * knowledge.
 */
export function sanitizeGenerationPrompt(prompt: string): string {
    return prompt
        .replace(/\[[A-Z_ ]+\][^[]*/g, (block) => {
            // Keep the content of descriptive blocks, drop the tag itself.
            const content = block.replace(/^\[[A-Z_ ]+\]\s*:?\s*/, '')
            return content
        })
        .replace(/\s{2,}/g, ' ')
        .trim()
}
