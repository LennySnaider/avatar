/**
 * F5.2 (Estratega) — Herramienta de lectura: QUÉ AVATARES HAY.
 *
 * Es la primera que el modelo debe llamar casi siempre: el resto de
 * herramientas piden un `avatarId`, y sin esta el modelo se lo inventaría o
 * le preguntaría al usuario un dato que ya tenemos.
 *
 * `fetchAvatarsOverview` se exporta aparte de la herramienta porque la MISMA
 * lectura la necesita el prompt de sistema (la lista de avatares con sus
 * redes y si la IA está encendida, ver `../../systemPrompt.ts`). Una sola
 * consulta, un solo sitio donde arreglarla.
 *
 * DOS CONSULTAS Y NO UN JOIN: `social_profiles` no cuelga de `avatars` por
 * clave foránea obligatoria (hay avatares sin perfil social), y el `!inner`
 * de PostgREST los dejaría fuera justo a ellos — que son los que el usuario
 * necesita ver para saber que le falta conectar algo.
 */
import { z } from 'zod'
import { orgTable } from '@/lib/org/orgTable'
import type { AssistantToolDef, ToolEnv } from '../../types'
import type { OrgContext } from '@/lib/tenant/getOrgContext'

/** Tope de avatares que se leen de una vez. Por encima, la respuesta del
 *  modelo dejaría de ser útil mucho antes de que el límite estorbe. */
const MAX_AVATARS = 100

export interface AvatarOverview {
    avatarId: string
    name: string
    /** Cuenta de Upload-Post, o null si el avatar no tiene perfil social. */
    uploadPostUsername: string | null
    /** `active` / `suspended` / … o `'none'` si no hay perfil. */
    socialStatus: string
    /** Redes conectadas, como `instagram:cuenta`. Vacío = ninguna. */
    platforms: string[]
    /** ¿Contesta la IA a los comentarios públicos de sus posts? */
    aiCommentReplies: boolean
    /** ¿Tiene persona de IA encendida (chats privados)? */
    aiPersonaEnabled: boolean
}

type AvatarRow = { id: string; name: string }
type ProfileRow = {
    avatar_id: string | null
    upload_post_username: string
    status: string
    connected_platforms: unknown
    ai_comment_replies_enabled: boolean | null
}
type PersonaRow = { avatar_id: string; enabled: boolean }

/**
 * `connected_platforms` es un JSONB que escribe el sincronizador de
 * Upload-Post. Se lee a la defensiva porque es una columna sin esquema: una
 * entrada rota tiene que costar una red en la lista, no la herramienta entera.
 */
function readPlatforms(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    const out: string[] = []
    for (const item of value) {
        if (typeof item !== 'object' || item === null) continue
        const { platform, accountName } = item as {
            platform?: unknown
            accountName?: unknown
        }
        if (typeof platform !== 'string' || platform.length === 0) continue
        out.push(
            typeof accountName === 'string' && accountName.length > 0
                ? `${platform}:${accountName}`
                : platform,
        )
    }
    return out
}

export async function fetchAvatarsOverview(
    ctx: OrgContext,
): Promise<AvatarOverview[]> {
    const [avatarsRes, profilesRes, personasRes] = await Promise.all([
        orgTable(ctx, 'avatars')
            .select('id, name')
            .order('created_at', { ascending: true })
            .limit(MAX_AVATARS),
        orgTable(ctx, 'social_profiles').select(
            'avatar_id, upload_post_username, status, connected_platforms, ai_comment_replies_enabled',
        ),
        orgTable(ctx, 'avatar_personas').select('avatar_id, enabled'),
    ])
    // Los errores se LANZAN con contexto: la ruta los convierte en un mensaje
    // de herramienta para el modelo. Devolver una lista vacía haría que el
    // agente afirmara "no tienes avatares", que es una conclusión distinta.
    for (const [nombre, res] of [
        ['avatars', avatarsRes],
        ['social_profiles', profilesRes],
        ['avatar_personas', personasRes],
    ] as const) {
        if (res.error) {
            throw new Error(
                `listAvatars: fallo leyendo ${nombre} (org ${ctx.organizationId}): ${res.error.message}`,
            )
        }
    }

    const avatars = (avatarsRes.data ?? []) as AvatarRow[]
    const profiles = (profilesRes.data ?? []) as ProfileRow[]
    const personas = (personasRes.data ?? []) as PersonaRow[]
    const perfilPorAvatar = new Map(
        profiles
            .filter((p) => typeof p.avatar_id === 'string')
            .map((p) => [p.avatar_id as string, p]),
    )
    const personaPorAvatar = new Map(personas.map((p) => [p.avatar_id, p]))

    return avatars.map((a) => {
        const perfil = perfilPorAvatar.get(a.id)
        return {
            avatarId: a.id,
            name: a.name,
            uploadPostUsername: perfil?.upload_post_username ?? null,
            socialStatus: perfil?.status ?? 'none',
            platforms: readPlatforms(perfil?.connected_platforms),
            aiCommentReplies: Boolean(perfil?.ai_comment_replies_enabled),
            aiPersonaEnabled: Boolean(personaPorAvatar.get(a.id)?.enabled),
        }
    })
}

const listAvatarsInput = z.object({})

export const listAvatars: AssistantToolDef<z.infer<typeof listAvatarsInput>> = {
    name: 'listAvatars',
    description:
        'Lista los avatares de la organización con su cuenta de Upload-Post, las redes conectadas y si tienen IA encendida. Úsala primero: el resto de herramientas necesitan el avatarId que devuelve.',
    inputSchema: listAvatarsInput,
    permission: 'content:read',
    // En todas las pantallas: saber qué avatares hay es el contexto mínimo de
    // cualquier pregunta, la haga desde donde la haga.
    screens: 'all',
    mutating: false,
    async execute(_input, { ctx }: ToolEnv) {
        return fetchAvatarsOverview(ctx)
    },
}
