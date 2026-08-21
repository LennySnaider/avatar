import { getOrgContext, type OrgContext } from '@/lib/tenant/getOrgContext'
import { orgTable, orgSupabase } from '@/lib/org/orgTable'
import type { AIProvider, Prompt, Avatar, AvatarReference } from '@/@types/supabase'
import type { ClonedVoice } from '@/@types/voice'

interface AvatarStudioData {
    avatar: Avatar | null
    references: AvatarReference[]
    providers: AIProvider[]
    prompts: Prompt[]
    defaultVoice: ClonedVoice | null
}

const getAvatarStudioData = async (
    avatarId?: string,
    userId?: string
): Promise<AvatarStudioData> => {
    // F4.2 Tarea 3 — Esta funcion alimenta avatar-studio/page.tsx Y
    // avatar-studio/[slug]/page.tsx DURANTE EL RENDER (no es un endpoint que
    // el cliente pueda reintentar tras un error): si getOrgContext() lanza,
    // el throw tira la pagina entera en vez de degradarse.
    //
    // [slug]/page.tsx ya redirige a /sign-in ANTES de llamar aca, pero la
    // raiz (avatar-studio/page.tsx) NO tiene ese gate propio — hoy, sin
    // sesion, `userId` llegaba `undefined` y los `if (userId)`/`if (avatarId)`
    // de mas abajo simplemente se saltaban, devolviendo listas/avatar vacios
    // sin reventar (nunca lanzaba). Se preserva ese mismo contrato "vacio, no
    // throw" resolviendo el contexto con try/catch: sin sesion u org no hay
    // ninguna fila segura que devolver (ya no se puede acotar por
    // organizacion), asi que se sigue con `ctx = null` y las mismas ramas
    // vacias de antes en vez de dejar que la excepcion se propague. En
    // produccion esta rama no deberia dispararse nunca: el middleware ya
    // bloquea el acceso anonimo a toda la ruta (`publicRoutes` esta vacio) —
    // esto es defensa en profundidad, no la autorizacion real.
    let ctx: OrgContext | null = null
    try {
        ctx = await getOrgContext()
    } catch {
        ctx = null
    }

    // Catalogo de proveedores: filas globales (organization_id NULL, key por
    // env) + BYOK de la propia org — mismo filtro que apiGetProviders() en
    // AvatarForgeService.ts. Antes esta consulta no tenia NINGUN filtro de
    // organizacion (leia BYOK de cualquier org); sin ctx resuelto se cae a
    // solo-globales en vez de repetir esa fuga.
    const providersFilter = orgSupabase()
        .from('ai_providers')
        .select('*')
        .eq('is_active', true)
    const { data: providers, error: providersError } = await (
        ctx
            ? providersFilter.or(
                  `organization_id.is.null,organization_id.eq.${ctx.organizationId}`,
              )
            : providersFilter.is('organization_id', null)
    ).order('name')

    if (providersError) {
        console.error('Error fetching providers:', providersError)
    }

    // Get user's prompts
    let prompts: Prompt[] = []
    if (ctx && userId) {
        const { data: userPrompts, error: promptsError } = await orgTable(ctx, 'prompts')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })

        if (promptsError) {
            console.error('Error fetching prompts:', promptsError)
        } else {
            prompts = userPrompts || []
        }
    }

    // Get avatar if editing
    let avatar: Avatar | null = null
    let references: AvatarReference[] = []
    let defaultVoice: ClonedVoice | null = null

    if (avatarId && ctx) {
        const { data: avatarData, error: avatarError } = await orgTable(ctx, 'avatars')
            .select('*')
            .eq('id', avatarId)
            .single()

        if (avatarError) {
            console.error('Error fetching avatar:', avatarError)
        } else {
            avatar = avatarData
        }

        // Get references
        if (avatar) {
            const { data: refsData, error: refsError } = await orgTable(ctx, 'avatar_references')
                .select('*')
                .eq('avatar_id', avatarId)

            if (refsError) {
                console.error('Error fetching references:', refsError)
            } else {
                references = refsData || []
            }

            // Get the avatar's default cloned voice, if any
            if (avatar?.default_voice_id) {
                const { data: voiceData, error: voiceError } = await orgTable(ctx, 'cloned_voices')
                    .select('*')
                    .eq('id', avatar.default_voice_id)
                    .eq('status', 'ready')
                    .single()

                if (voiceError) {
                    console.error('Error fetching default voice:', voiceError)
                } else {
                    defaultVoice = voiceData as unknown as ClonedVoice
                }
            }
        }
    }

    return {
        avatar,
        references,
        // Igual que apiGetProviders() en AvatarForgeService.ts: la fila trae
        // columnas (api_key, organization_id) que el DTO AIProvider no
        // expone a proposito.
        providers: (providers || []) as unknown as AIProvider[],
        prompts,
        defaultVoice,
    }
}

export default getAvatarStudioData
