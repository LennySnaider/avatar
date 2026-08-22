import { getR2PublicUrl } from '@/lib/mediaStore'
import { getOrgContext } from '@/lib/tenant/getOrgContext'
import { orgTable, orgSupabase } from '@/lib/org/orgTable'
import type { AvatarWithReferences } from '@/app/(protected-pages)/concepts/avatar-forge/avatar-list/types'
import type { Avatar, AvatarReference } from '@/@types/supabase'

interface AvatarWithRefs extends Avatar {
    avatar_references: AvatarReference[]
    default_voice: { name: string } | null
}

const getAvatars = async (_queryParams: {
    [key: string]: string | string[] | undefined
}) => {
    const queryParams = _queryParams
    // `userId` sigue llegando en queryParams (avatar-list/page.tsx lo manda
    // desde la sesion) pero ya no se usa para filtrar: ver el comentario
    // junto a `avatarsQuery` mas abajo.
    const {
        pageIndex = '1',
        pageSize = '12',
        query,
    } = queryParams

    const page = parseInt(pageIndex as string) || 1
    const limit = parseInt(pageSize as string) || 12
    const offset = (page - 1) * limit

    // F4.2 Tarea 3 — avatar-list/page.tsx llama a esta funcion durante el
    // render SIN gate de sesion propio (a diferencia de
    // avatar-studio/[slug], que redirige antes de leer datos). Antes de esta
    // migracion, sin sesion la query de avatares quedaba SIN NINGUN filtro:
    // devolvia avatares de CUALQUIER organizacion (el hueco que cierra esta
    // tarea). Ese comportamiento no se replica: sin org resuelta no hay
    // ninguna fila segura que mostrar, asi que se cae al mismo
    // `{ list: [], total: 0 }` que ya usa el catch de error mas abajo — no
    // revienta el render (y el middleware ya bloquea el acceso anonimo a
    // esta ruta de por si).
    let ctx
    try {
        ctx = await getOrgContext()
    } catch {
        return {
            list: [] as AvatarWithReferences[],
            total: 0,
        }
    }

    const supabase = orgSupabase()

    // Build query for avatars
    //
    // NO se filtra por user_id (a diferencia de la version anterior de este
    // archivo): en el modelo de agencia los miembros de una org COMPARTEN
    // sus avatares, mismo criterio que ya aplican SocialService.ts (acab85d)
    // y FanvueService.ts (8c1d5f2). La razon de peso no es solo estilo:
    // apiGetAvatars() en AvatarForgeService.ts YA lista toda la org sin
    // filtrar por usuario, asi que si esta funcion filtrara por user_id
    // devolveria una lista DISTINTA para el mismo usuario segun de donde la
    // pida — dos pantallas que se contradicen entre si (un avatar visible en
    // una y no en la otra) en cuanto exista una segunda org.
    let avatarsQuery = orgTable(ctx, 'avatars')
        // El nombre de la voz viene embebido por la FK, no con una consulta
        // extra. Hay DOS relaciones entre avatars y cloned_voices (la voz
        // apunta a su avatar, y el avatar a su voz principal), así que hay que
        // nombrar la clave o PostgREST no sabe cuál seguir.
        .select(
            '*, avatar_references(*), default_voice:cloned_voices!avatars_default_voice_id_fkey(name)',
            { count: 'exact' },
        )
        .order('created_at', { ascending: false })

    // Search filter
    if (query) {
        avatarsQuery = avatarsQuery.ilike('name', `%${query}%`)
    }

    // Apply pagination
    avatarsQuery = avatarsQuery.range(offset, offset + limit - 1)

    const { data: avatars, count, error } = await avatarsQuery as {
        data: AvatarWithRefs[] | null
        count: number | null
        error: unknown
    }

    if (error) {
        console.error('Error fetching avatars:', error)
        return {
            list: [] as AvatarWithReferences[],
            total: 0,
        }
    }

    // Get signed URLs for avatar references (thumbnails)
    const avatarsWithUrls: AvatarWithReferences[] = await Promise.all(
        (avatars || []).map(async (avatar) => {
            const references = avatar.avatar_references || []

            // Candidatos EN ORDEN (cara → angle → general): durante la
            // ventana del trasplante conviven filas viejas sin bytes y
            // re-subidas nuevas del mismo tipo — hay que probar hasta que
            // una firme, no rendirse con la primera.
            const candidates: Array<{
                type: string
                storage_path: string
                storage_provider?: string | null
            }> = [
                ...references.filter((r: { type: string }) => r.type === 'face'),
                ...references.filter((r: { type: string }) => r.type === 'angle'),
                ...references.filter((r: { type: string }) => r.type === 'general'),
            ]

            let thumbnailUrl: string | undefined
            for (const cand of candidates) {
                // R2 no se firma: su bucket es público (igual que `avatars` en
                // Supabase) y su URL trae caché inmutable de un año — que es
                // justo el egress que la migración venía a ahorrar. Ver
                // getSignedUrl en AvatarForgeService.
                if (cand.storage_provider === 'r2') {
                    try {
                        thumbnailUrl = getR2PublicUrl(cand.storage_path)
                        break
                    } catch {
                        // sin base pública configurada → se intenta Supabase
                    }
                }
                const { data: signedUrl } = await supabase.storage
                    .from('avatars')
                    .createSignedUrl(cand.storage_path, 3600)
                if (signedUrl?.signedUrl) {
                    thumbnailUrl = signedUrl.signedUrl
                    break
                }
            }

            return {
                ...avatar,
                avatar_references: references,
                thumbnailUrl,
            } as AvatarWithReferences
        })
    )

    return {
        list: avatarsWithUrls,
        total: count || 0,
    }
}

export default getAvatars
