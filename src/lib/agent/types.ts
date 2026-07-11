/** Domain types for the per-avatar AI agent (persona + RAG + chat). */

/**
 * 'kie' (Grok via api.kie.ai, custom non-OpenAI protocol) is reserved in the
 * DB check constraint but its adapter is not implemented yet — the UI only
 * offers gemini/openrouter for now.
 */
export type ChatProviderSlug = 'gemini' | 'openrouter' | 'kie'

export type KnowledgeKind = 'bio' | 'lore' | 'faq' | 'media' | 'post' | 'manual'

export type ResponseTone = 'flirty' | 'friendly' | 'dominant' | 'sweet' | 'mysterious' | 'playful'
export type ResponseObjective = 'engagement' | 'sales' | 'retention' | 'support'
export type ResponseLength = 'short' | 'medium' | 'long'
export type NsfwLevel = 'sfw' | 'suggestive' | 'explicit'

export interface PersonaPersonality {
    traits?: string[]
    interests?: string[]
    quirks?: string[]
    emojiUsage?: 'low' | 'medium' | 'high'
}

/** Client-safe persona view — NEVER carries the raw api_key. */
export interface PersonaDTO {
    id: string
    avatarId: string
    enabled: boolean
    systemPrompt: string | null
    backstory: string | null
    personality: PersonaPersonality
    writingStyle: string | null
    boundaries: string | null
    languages: string[]
    chatProvider: ChatProviderSlug
    chatModel: string
    hasApiKey: boolean
    responseTone: ResponseTone
    responseObjective: ResponseObjective
    responseLength: ResponseLength
    nsfwLevel: NsfwLevel
    updatedAt: string
}

export interface KnowledgeItemDTO {
    id: string
    kind: KnowledgeKind
    title: string | null
    content: string
    sourceRef: string | null
    hasEmbedding: boolean
    createdAt: string
}

export interface RetrievedChunk {
    id: string
    kind: string
    title: string | null
    content: string
    similarity: number
    metadata?: Record<string, unknown>
}

export const AGENT_MODEL_PRESETS: Record<'gemini' | 'openrouter', { value: string; label: string }[]> = {
    gemini: [
        { value: 'gemini-flash-latest', label: 'Gemini Flash (latest, recommended)' },
        { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
        { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro (best quality)' },
        { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (legacy)' },
    ],
    openrouter: [
        { value: 'openai/gpt-4o-mini', label: 'GPT-4o mini (cheap, SFW)' },
        { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet (writing, SFW)' },
        { value: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B (permissive)' },
    ],
}

export const RESPONSE_TONES: ResponseTone[] = ['flirty', 'friendly', 'dominant', 'sweet', 'mysterious', 'playful']
export const RESPONSE_OBJECTIVES: ResponseObjective[] = ['engagement', 'sales', 'retention', 'support']
export const RESPONSE_LENGTHS: ResponseLength[] = ['short', 'medium', 'long']
export const NSFW_LEVELS: NsfwLevel[] = ['sfw', 'suggestive', 'explicit']
