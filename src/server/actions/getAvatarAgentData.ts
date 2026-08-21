import { getOrgContext } from '@/lib/tenant/getOrgContext'
import { orgTable } from '@/lib/org/orgTable'
import { toPersonaDTO } from '@/lib/agent/personaMapper'
import type { PersonaDTO } from '@/lib/agent/types'
import type { Avatar } from '@/@types/supabase'

export interface AvatarAgentData {
    avatar: Avatar | null
    persona: PersonaDTO | null
    knowledgeCount: number
}

/**
 * Server loader for the per-avatar Agent page (pattern: getAvatarStudioData).
 *
 * getOrgContext() lanza si no hay sesion, pero el UNICO caller de esta
 * funcion (agent/[slug]/page.tsx) YA redirige a /sign-in ANTES de invocarla
 * — a diferencia de getAvatarStudioData/getAvatars (que si tienen rutas de
 * render sin ese gate), aca no hace falta un try/catch propio: el layout de
 * la pagina ya protege la ruta, asi que un throw aca nunca llega a mitad de
 * un render sin sesion.
 */
const getAvatarAgentData = async (avatarId: string): Promise<AvatarAgentData> => {
    const ctx = await getOrgContext()

    const { data: avatar, error: avatarError } = await orgTable(ctx, 'avatars')
        .select('*')
        .eq('id', avatarId)
        .maybeSingle()
    if (avatarError) console.error('Error fetching avatar:', avatarError)
    if (!avatar) return { avatar: null, persona: null, knowledgeCount: 0 }

    const [{ data: personaRow }, { count }] = await Promise.all([
        orgTable(ctx, 'avatar_personas').select('*').eq('avatar_id', avatarId).maybeSingle(),
        orgTable(ctx, 'avatar_knowledge')
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
