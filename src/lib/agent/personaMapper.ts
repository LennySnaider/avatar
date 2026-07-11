/** Row → client-safe DTO (never exposes api_key). Shared by service, route and loaders. */
import type { AvatarPersonaRow } from './db'
import type {
    ChatProviderSlug,
    NsfwLevel,
    PersonaDTO,
    PersonaPersonality,
    ResponseLength,
    ResponseObjective,
    ResponseTone,
} from './types'

export function toPersonaDTO(row: AvatarPersonaRow): PersonaDTO {
    return {
        id: row.id,
        avatarId: row.avatar_id,
        enabled: row.enabled,
        systemPrompt: row.system_prompt,
        backstory: row.backstory,
        personality: (row.personality ?? {}) as PersonaPersonality,
        writingStyle: row.writing_style,
        boundaries: row.boundaries,
        languages: row.languages ?? ['en'],
        chatProvider: row.chat_provider as ChatProviderSlug,
        chatModel: row.chat_model,
        hasApiKey: Boolean(row.api_key),
        responseTone: row.response_tone as ResponseTone,
        responseObjective: row.response_objective as ResponseObjective,
        responseLength: row.response_length as ResponseLength,
        nsfwLevel: row.nsfw_level as NsfwLevel,
        updatedAt: row.updated_at,
    }
}
