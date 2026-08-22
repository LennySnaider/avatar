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
 * getOrgContext() lanza por DOS motivos distintos (getOrgContext.ts:27 sin
 * sesion, :29 sin fila en organization_members) y el gate del caller
 * (agent/[slug]/page.tsx: `if (!session?.user?.id) redirect(...)`) sólo
 * cubre el primero. Un usuario AUTENTICADO pero sin membresia de org
 * todavia puede llegar aca — sin este try/catch ese throw se propagaba
 * hasta el render y salia como 500 generico (no hay error.tsx en
 * (protected-pages) ni en avatar-forge/agent). Se resuelve con el MISMO
 * contrato "vacio, no throw" que ya usan getAvatarStudioData.ts y
 * getAvatars.ts: sin org resuelta no hay fila segura que devolver, asi que
 * se cae al mismo shape que "avatar no encontrado" — el caller ya redirige
 * en ese caso.
 */
const getAvatarAgentData = async (avatarId: string): Promise<AvatarAgentData> => {
    let ctx
    try {
        ctx = await getOrgContext()
    } catch {
        return { avatar: null, persona: null, knowledgeCount: 0 }
    }

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
