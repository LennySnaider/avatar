/**
 * F5.2 (Estratega) — Herramientas de lectura de REDES SOCIALES.
 *
 *  - `getSocialAnalytics`: la foto de la cuenta (seguidores, vistas,
 *    engagement) que da Upload-Post.
 *  - `getRecentPostsPerformance`: qué se publicó en los últimos 14 días y
 *    cuánta conversación generó cada post.
 *
 * LA VENTANA ES FIJA (14 días) y va escrita en la descripción de la
 * herramienta. Un parámetro de días haría que el modelo pidiera "los últimos
 * 90" sin medir el coste, y el prompt de sistema obliga a citar el periodo:
 * si el periodo lo elige el modelo, acaba citando el que creía haber pedido.
 */
import { z } from 'zod'
import { orgTable } from '@/lib/org/orgTable'
import { getSocialProvider } from '@/lib/social/provider'
import { addDaysIso, utcToday } from '@/lib/earnings/period'
import { ALL_PLATFORMS, type Platform } from '@/@types/social'
import type { AssistantToolDef, ToolEnv } from '../../types'

/** Días de la ventana de `getRecentPostsPerformance`, inclusive hoy. */
const WINDOW_DAYS = 14
/** Tope de posts leídos. Más allá, el resumen deja de ser un resumen. */
const MAX_POSTS = 50
/** Tope que PostgREST aplica en silencio. Se usa para DETECTAR el corte. */
const ROW_CAP = 1000
/** Recorte del caption: el modelo necesita reconocer el post, no leerlo. */
const CAPTION_CHARS = 140

/** Medianoche UTC de hace `days-1` días, en ISO. */
function windowStart(days: number, today = utcToday()): string {
    return `${addDaysIso(today, -(days - 1))}T00:00:00.000Z`
}

// ─────────────────────────────────────────────────────────────────────────
// getSocialAnalytics
// ─────────────────────────────────────────────────────────────────────────

const analyticsInput = z.object({
    avatarId: z
        .string()
        .describe('El id del avatar, tal y como lo devuelve listAvatars.'),
    platforms: z
        .array(z.enum(ALL_PLATFORMS))
        .optional()
        .describe(
            'Redes a consultar. Si se omite, se usan las que el avatar tiene conectadas.',
        ),
})

type ProfileRow = {
    upload_post_username: string
    connected_platforms: unknown
}

/** Redes del JSONB `connected_platforms`, filtradas a las que conocemos. */
function connectedPlatforms(value: unknown): Platform[] {
    if (!Array.isArray(value)) return []
    const conocidas = new Set<string>(ALL_PLATFORMS)
    const out: Platform[] = []
    for (const item of value) {
        const p = (item as { platform?: unknown } | null)?.platform
        if (
            typeof p === 'string' &&
            conocidas.has(p) &&
            !out.includes(p as Platform)
        ) {
            out.push(p as Platform)
        }
    }
    return out
}

export const getSocialAnalytics: AssistantToolDef<
    z.infer<typeof analyticsInput>
> = {
    name: 'getSocialAnalytics',
    description:
        'Métricas actuales de las cuentas sociales de un avatar (seguidores, vistas, impresiones, engagement y nº de posts) por red, según Upload-Post.',
    inputSchema: analyticsInput,
    permission: 'content:read',
    screens: ['social-accounts', 'social-posts', 'studio', 'other'],
    mutating: false,
    async execute({ avatarId, platforms }, { ctx }: ToolEnv) {
        const { data, error } = await orgTable(ctx, 'social_profiles')
            .select('upload_post_username, connected_platforms')
            .eq('avatar_id', avatarId)
            .maybeSingle()
        if (error) {
            throw new Error(
                `getSocialAnalytics: fallo leyendo social_profiles (avatar ${avatarId}): ${error.message}`,
            )
        }
        const profile = (data ?? null) as ProfileRow | null
        if (!profile) {
            // No es un error: es la respuesta. El avatar existe y no tiene
            // cuenta conectada, y eso es exactamente lo que hay que contarle
            // al usuario.
            return {
                avatarId,
                uploadPostUsername: null,
                snapshots: [],
                note: 'Este avatar no tiene cuenta de Upload-Post conectada.',
            }
        }

        const pedidas =
            platforms && platforms.length > 0
                ? platforms
                : connectedPlatforms(profile.connected_platforms)
        if (pedidas.length === 0) {
            // Upload-Post EXIGE al menos una red: llamar con lista vacía
            // lanzaría. Se responde con el dato que sí tenemos.
            return {
                avatarId,
                uploadPostUsername: profile.upload_post_username,
                snapshots: [],
                note: 'La cuenta existe pero no tiene ninguna red conectada.',
            }
        }

        const snapshots = await getSocialProvider().getAnalytics(
            profile.upload_post_username,
            pedidas,
        )
        return {
            avatarId,
            uploadPostUsername: profile.upload_post_username,
            platforms: pedidas,
            snapshots,
        }
    },
}

// ─────────────────────────────────────────────────────────────────────────
// getRecentPostsPerformance
// ─────────────────────────────────────────────────────────────────────────

const recentPostsInput = z.object({
    avatarId: z
        .string()
        .optional()
        .describe(
            'Limita el resultado a un avatar. Si se omite, se devuelven los posts de toda la organización.',
        ),
})

type PostRow = {
    id: string
    caption: string | null
    status: string
    published_at: string | null
    platforms: unknown
    social_profile_id: string | null
}
type TargetRow = {
    social_post_id: string
    platform: string
    platform_post_id: string
    post_url: string | null
}
type ChatRow = { context: unknown }

export const getRecentPostsPerformance: AssistantToolDef<
    z.infer<typeof recentPostsInput>
> = {
    name: 'getRecentPostsPerformance',
    description:
        'Publicaciones de los últimos 14 días con la red donde salieron, su enlace y cuántos hilos de comentarios generaron (los que la IA vigila). Úsala para comparar qué contenido funcionó.',
    inputSchema: recentPostsInput,
    permission: 'content:read',
    screens: ['social-accounts', 'social-posts', 'studio', 'other'],
    mutating: false,
    async execute({ avatarId }, { ctx }: ToolEnv) {
        const since = windowStart(WINDOW_DAYS)

        // El filtro por avatar pasa por su perfil social: `social_posts` no
        // guarda `avatar_id`, cuelga de `social_profile_id`.
        let profileIds: string[] | null = null
        if (avatarId) {
            const { data, error } = await orgTable(ctx, 'social_profiles')
                .select('id')
                .eq('avatar_id', avatarId)
            if (error) {
                throw new Error(
                    `getRecentPostsPerformance: fallo leyendo social_profiles (avatar ${avatarId}): ${error.message}`,
                )
            }
            profileIds = ((data ?? []) as { id: string }[]).map((r) => r.id)
            if (profileIds.length === 0) {
                return {
                    periodDays: WINDOW_DAYS,
                    since,
                    posts: [],
                    note: 'Este avatar no tiene cuenta de Upload-Post conectada, así que no tiene publicaciones.',
                }
            }
        }

        let postsQuery = orgTable(ctx, 'social_posts')
            .select(
                'id, caption, status, published_at, platforms, social_profile_id',
            )
            .gte('published_at', since)
            .order('published_at', { ascending: false })
            .limit(MAX_POSTS)
        if (profileIds)
            postsQuery = postsQuery.in('social_profile_id', profileIds)
        const { data: postsData, error: postsError } = await postsQuery
        if (postsError) {
            throw new Error(
                `getRecentPostsPerformance: fallo leyendo social_posts (org ${ctx.organizationId}): ${postsError.message}`,
            )
        }
        const posts = (postsData ?? []) as PostRow[]
        if (posts.length === 0) {
            return { periodDays: WINDOW_DAYS, since, posts: [] }
        }

        const { data: targetsData, error: targetsError } = await orgTable(
            ctx,
            'social_post_targets',
        )
            .select('social_post_id, platform, platform_post_id, post_url')
            .in(
                'social_post_id',
                posts.map((p) => p.id),
            )
        if (targetsError) {
            throw new Error(
                `getRecentPostsPerformance: fallo leyendo social_post_targets (org ${ctx.organizationId}): ${targetsError.message}`,
            )
        }
        const targets = (targetsData ?? []) as TargetRow[]

        // Hilos de comentarios: un `agent_chats` con platform `social:<red>`
        // por cada comentarista de cada post.
        //
        // Se filtran por `created_at >= since` y NO por el id del post, y eso
        // es exacto, no una aproximación: un hilo de comentarios no puede
        // existir antes que el post que comenta, así que todos los hilos de
        // los posts de esta ventana se crearon dentro de ella. Filtrar por
        // fecha evita tener que meter un filtro sobre un camino JSON
        // (`context->>platformPostId`) en la consulta.
        const {
            data: chatsData,
            error: chatsError,
            count,
        } = await orgTable(ctx, 'agent_chats')
            .select('context', { count: 'exact' })
            .like('platform', 'social:%')
            .gte('created_at', since)
            .limit(ROW_CAP)
        if (chatsError) {
            throw new Error(
                `getRecentPostsPerformance: fallo leyendo agent_chats (org ${ctx.organizationId}): ${chatsError.message}`,
            )
        }
        const chats = (chatsData ?? []) as ChatRow[]
        // PostgREST corta en 1000 filas EN SILENCIO. Con el `count` exacto se
        // ve el corte; sin este aviso, los conteos saldrían bajos y nadie
        // sabría por qué.
        const truncated = typeof count === 'number' && count > chats.length
        if (truncated) {
            console.warn(
                '[estratega social] conteo de comentarios truncado por el tope de filas',
                {
                    organizationId: ctx.organizationId,
                    count,
                    leidos: chats.length,
                },
            )
        }

        const hilosPorPost = new Map<string, number>()
        for (const chat of chats) {
            const ctxChat = chat.context
            if (typeof ctxChat !== 'object' || ctxChat === null) continue
            const postId = (ctxChat as { platformPostId?: unknown })
                .platformPostId
            if (typeof postId !== 'string' || postId.length === 0) continue
            hilosPorPost.set(postId, (hilosPorPost.get(postId) ?? 0) + 1)
        }

        const targetsPorPost = new Map<string, TargetRow[]>()
        for (const t of targets) {
            const lista = targetsPorPost.get(t.social_post_id)
            if (lista) lista.push(t)
            else targetsPorPost.set(t.social_post_id, [t])
        }

        return {
            periodDays: WINDOW_DAYS,
            since,
            ...(truncated
                ? {
                      warning:
                          'Hay más hilos de comentarios de los que se pudieron leer: los conteos son un mínimo, no el total.',
                  }
                : {}),
            posts: posts.map((p) => {
                const salidas = targetsPorPost.get(p.id) ?? []
                return {
                    postId: p.id,
                    caption: (p.caption ?? '').slice(0, CAPTION_CHARS),
                    status: p.status,
                    publishedAt: p.published_at,
                    targets: salidas.map((t) => ({
                        platform: t.platform,
                        postUrl: t.post_url,
                        commentThreads:
                            hilosPorPost.get(t.platform_post_id) ?? 0,
                    })),
                    commentThreads: salidas.reduce(
                        (acc, t) =>
                            acc + (hilosPorPost.get(t.platform_post_id) ?? 0),
                        0,
                    ),
                }
            }),
        }
    },
}
