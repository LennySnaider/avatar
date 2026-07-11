import { agentSupabase } from '@/lib/agent/db'
import { toPersonaDTO } from '@/lib/agent/personaMapper'
import type { PersonaDTO } from '@/lib/agent/types'
import type { Avatar } from '@/@types/supabase'

export interface AvatarAgentData {
    avatar: Avatar | null
    persona: PersonaDTO | null
    knowledgeCount: number
}

/** Server loader for the per-avatar Agent page (pattern: getAvatarStudioData). */
const getAvatarAgentData = async (avatarId: string): Promise<AvatarAgentData> => {
    const supabase = agentSupabase()

    const { data: avatar, error: avatarError } = await supabase
        .from('avatars')
        .select('*')
        .eq('id', avatarId)
        .maybeSingle()
    if (avatarError) console.error('Error fetching avatar:', avatarError)
    if (!avatar) return { avatar: null, persona: null, knowledgeCount: 0 }

    const [{ data: personaRow }, { count }] = await Promise.all([
        supabase.from('avatar_personas').select('*').eq('avatar_id', avatarId).maybeSingle(),
        supabase
            .from('avatar_knowledge')
            .select('id', { count: 'exact', head: true })
            .eq('avatar_id', avatarId),
    ])

    return {
        avatar: avatar as Avatar,
        persona: personaRow ? toPersonaDTO(personaRow) : null,
        knowledgeCount: count ?? 0,
    }
}

export default getAvatarAgentData
