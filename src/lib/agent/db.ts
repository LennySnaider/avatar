/**
 * Typed Supabase access for the agent module (organizations + persona + RAG).
 *
 * `src/@types/supabase.ts` is hand-maintained and does not include these
 * tables (their migrations live under supabase/migrations and are applied out
 * of band). Extend the base type locally so queries stay fully typed —
 * mirroring `tokenStore.ts` / `SocialService.ts`. Phase 2+ tables
 * (agent_chats, agent_messages, avatar_fan_memories) get added here.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase'
import type { Database as BaseDatabase, Json } from '@/@types/supabase'

interface OrganizationsTable {
    Row: {
        id: string
        name: string
        slug: string
        created_at: string
        updated_at: string
    }
    Insert: { id?: string; name: string; slug: string; created_at?: string; updated_at?: string }
    Update: { id?: string; name?: string; slug?: string; created_at?: string; updated_at?: string }
    Relationships: []
}

export type OrgMemberRole = 'owner' | 'admin' | 'operator'

interface OrganizationMembersTable {
    Row: {
        id: string
        organization_id: string
        user_id: string
        role: OrgMemberRole
        created_at: string
    }
    Insert: {
        id?: string
        organization_id: string
        user_id: string
        role?: OrgMemberRole
        created_at?: string
    }
    Update: {
        id?: string
        organization_id?: string
        user_id?: string
        role?: OrgMemberRole
        created_at?: string
    }
    Relationships: []
}

interface AvatarPersonasTable {
    Row: {
        id: string
        organization_id: string
        avatar_id: string
        enabled: boolean
        system_prompt: string | null
        backstory: string | null
        personality: Json
        writing_style: string | null
        boundaries: string | null
        languages: string[]
        chat_provider: string
        chat_model: string
        api_key: string | null
        response_tone: string
        response_objective: string
        response_length: string
        nsfw_level: string
        autopilot: Json
        created_at: string
        updated_at: string
    }
    Insert: Partial<AvatarPersonasTable['Row']> & { organization_id: string; avatar_id: string }
    Update: Partial<AvatarPersonasTable['Row']>
    Relationships: []
}

interface AvatarKnowledgeTable {
    Row: {
        id: string
        organization_id: string
        avatar_id: string
        kind: string
        title: string | null
        content: string
        embedding: string | null // pgvector serialized; write as JSON.stringify(number[])
        metadata: Json
        source_ref: string | null
        created_at: string
        updated_at: string
    }
    Insert: Partial<AvatarKnowledgeTable['Row']> & {
        organization_id: string
        avatar_id: string
        content: string
    }
    Update: Partial<AvatarKnowledgeTable['Row']>
    Relationships: []
}

/** Minimal view of fanvue_posts (full type lives in FanvueService's local extension). */
interface FanvuePostsLiteTable {
    Row: {
        id: string
        user_id: string | null
        caption: string | null
        generation_id: string | null
        status: string | null
        created_at: string
    }
    Insert: never
    Update: never
    Relationships: []
}

export interface MatchKnowledgeRow {
    id: string
    kind: string
    title: string | null
    content: string
    metadata: Json
    similarity: number
}

export type AgentChatMode = 'off' | 'draft' | 'auto'
export type AgentMsgDirection = 'in' | 'out'
export type AgentMsgStatus = 'received' | 'draft' | 'approved' | 'sent' | 'failed' | 'discarded'

interface AgentChatsTable {
    Row: {
        id: string
        organization_id: string
        avatar_id: string
        platform: string
        external_chat_id: string
        fan_display_name: string | null
        fan_handle: string | null
        fan_avatar_url: string | null
        mode: AgentChatMode
        /** Counterpart is another creator / system bot (spam), not a paying fan. */
        is_creator: boolean
        needs_attention: boolean
        attention_reason: string | null
        last_message_at: string | null
        last_fan_message_at: string | null
        unread_count: number
        created_at: string
        updated_at: string
    }
    Insert: Partial<AgentChatsTable['Row']> & {
        organization_id: string
        avatar_id: string
        external_chat_id: string
    }
    Update: Partial<AgentChatsTable['Row']>
    Relationships: []
}

interface AgentMessagesTable {
    Row: {
        id: string
        organization_id: string
        chat_id: string
        direction: AgentMsgDirection
        external_message_id: string | null
        text: string | null
        media: Json
        status: AgentMsgStatus
        generated_by: Json | null
        approved_by: string | null
        error_message: string | null
        external_created_at: string | null
        sent_at: string | null
        send_after: string | null
        created_at: string
        updated_at: string
    }
    Insert: Partial<AgentMessagesTable['Row']> & {
        organization_id: string
        chat_id: string
        direction: AgentMsgDirection
        status: AgentMsgStatus
    }
    Update: Partial<AgentMessagesTable['Row']>
    Relationships: []
}

interface AvatarFanMemoriesTable {
    Row: {
        id: string
        organization_id: string
        avatar_id: string
        platform: string
        external_fan_id: string
        display_name: string | null
        facts: Json
        summary: string | null
        spend_total: number | null
        last_seen_at: string | null
        created_at: string
        updated_at: string
    }
    Insert: Partial<AvatarFanMemoriesTable['Row']> & {
        organization_id: string
        avatar_id: string
        external_fan_id: string
    }
    Update: Partial<AvatarFanMemoriesTable['Row']>
    Relationships: []
}

export type AgentChatRow = AgentChatsTable['Row']
export type AgentMessageRow = AgentMessagesTable['Row']
export type AvatarFanMemoryRow = AvatarFanMemoriesTable['Row']

export type AgentDatabase = BaseDatabase & {
    public: BaseDatabase['public'] & {
        Tables: BaseDatabase['public']['Tables'] & {
            organizations: OrganizationsTable
            organization_members: OrganizationMembersTable
            avatar_personas: AvatarPersonasTable
            avatar_knowledge: AvatarKnowledgeTable
            fanvue_posts: FanvuePostsLiteTable
            agent_chats: AgentChatsTable
            agent_messages: AgentMessagesTable
            avatar_fan_memories: AvatarFanMemoriesTable
        }
        Functions: {
            match_avatar_knowledge: {
                Args: {
                    p_avatar_id: string
                    p_query_embedding: string
                    p_match_count?: number
                    p_min_similarity?: number
                }
                Returns: MatchKnowledgeRow[]
            }
            increment_agent_counter: {
                Args: {
                    p_org: string
                    p_avatar: string
                    p_period: string
                    p_counter: string
                    p_delta?: number
                }
                Returns: undefined
            }
        }
    }
}

export type AvatarPersonaRow = AvatarPersonasTable['Row']
export type AvatarKnowledgeRow = AvatarKnowledgeTable['Row']

export function agentSupabase(): SupabaseClient<AgentDatabase> {
    return createServerSupabaseClient() as unknown as SupabaseClient<AgentDatabase>
}
