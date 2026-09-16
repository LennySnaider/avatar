/**
 * Sincroniza `social_post_targets` desde el historial de Upload-Post y lista
 * los targets pendientes de sondeo. Session-less (lo llama el cron): sin
 * `orgTable`, todo cuelga del `organization_id` de las filas ya cargadas
 * (`social_posts`/`social_profiles`), nunca de un id suelto.
 *
 * Fichero con IO — no se testea unitariamente (regla de
 * `global-constraints.md`: "Delivery/DB/cron code is not unit-tested"). El
 * import de `agentSupabase` es estático a propósito, a diferencia de
 * `settings.ts`: ningún test intenta importar este fichero.
 *
 * @see docs/superpowers/specs — task-5-brief.md / global-constraints.md (comentarios-ia-social)
 */
import { agentSupabase, type SocialProfileRow } from '@/lib/agent/db'
import { getSocialProvider } from '@/lib/social/provider'
import { resolveProfileKey } from '@/lib/social/profileKey'

const DAY_MS = 24 * 60 * 60 * 1000
/** Tope de posts publicados considerados por corrida — un perfil con miles
 *  de posts publicados no debe convertir un sondeo de 15 minutos en un
 *  barrido sin fin; el resto se recoge en la corrida siguiente. */
const POSTS_PER_RUN_CAP = 50

/** Narrow `social_posts.platforms` (jsonb, guardado como `Platform[]` — ver
 *  `social-reconcile/route.ts`) a un `Set<string>` para comparar. */
function toPlatformSet(platforms: unknown): Set<string> {
    if (!Array.isArray(platforms)) return new Set()
    return new Set(platforms.filter((p): p is string => typeof p === 'string'))
}

export interface SyncPostTargetsResult {
    /** Targets creados o actualizados (entradas `success && platformPostId` del history). */
    synced: number
    /** Entradas del history con `success=false` (publicó bien en una red, falló en otra). */
    failedEntries: number
}

/**
 * Un post `published` puede tener publicaciones reales en varias
 * plataformas (una por elemento de `social_posts.platforms`) y a cada una le
 * corresponde su propio `platform_post_id` real. Esta función busca los
 * posts publicados de `profileRow` en la ventana de `sinceDays` que todavía
 * les falte el target de AL MENOS una de sus plataformas, pide el history de
 * Upload-Post por `request_id` (una llamada cubre todas las plataformas de
 * ESE post) y upsertea un target por cada entrada `success=true` con
 * `platformPostId`. Las entradas `success=false` (falló en esa plataforma
 * concreta) se loguean, no se guardan — no hay `platform_post_id` real que
 * guardar.
 */
export async function syncPostTargets(profileRow: SocialProfileRow, sinceDays = 7): Promise<SyncPostTargetsResult> {
    const result: SyncPostTargetsResult = { synced: 0, failedEntries: 0 }
    const supabase = agentSupabase()
    const sinceIso = new Date(Date.now() - sinceDays * DAY_MS).toISOString()

    const { data: posts, error: postsError } = await supabase
        .from('social_posts')
        .select('id, organization_id, platforms, published_at, upload_post_request_id, caption')
        .eq('social_profile_id', profileRow.id)
        .eq('organization_id', profileRow.organization_id)
        .eq('status', 'published')
        .not('upload_post_request_id', 'is', null)
        .gte('published_at', sinceIso)
        .limit(POSTS_PER_RUN_CAP)
    if (postsError) {
        console.error(
            '[social-comments] no se pudieron listar los posts publicados para sincronizar targets',
            { profileId: profileRow.id },
            postsError,
        )
        return result
    }
    if (!posts || posts.length === 0) return result

    const postIds = posts.map((p) => p.id)
    const { data: existingTargets, error: targetsError } = await supabase
        .from('social_post_targets')
        .select('social_post_id, platform')
        .in('social_post_id', postIds)
    if (targetsError) {
        console.error(
            '[social-comments] no se pudieron leer los targets existentes',
            { profileId: profileRow.id },
            targetsError,
        )
        return result
    }
    const existingByPost = new Map<string, Set<string>>()
    for (const t of existingTargets ?? []) {
        const set = existingByPost.get(t.social_post_id) ?? new Set<string>()
        set.add(t.platform)
        existingByPost.set(t.social_post_id, set)
    }

    let provider
    try {
        provider = getSocialProvider(resolveProfileKey(profileRow))
    } catch (e) {
        console.warn('[social-comments] no hay provider utilizable para sincronizar targets', { profileId: profileRow.id }, e)
        return result
    }

    for (const post of posts) {
        const requestedPlatforms = toPlatformSet(post.platforms)
        const known = existingByPost.get(post.id) ?? new Set<string>()
        // Ya tiene target para TODAS sus plataformas pedidas — nada que sincronizar.
        const missing = [...requestedPlatforms].some((p) => !known.has(p))
        if (requestedPlatforms.size > 0 && !missing) continue
        if (!post.upload_post_request_id) continue // ya filtrado en el SELECT, cinturón para el tipo

        try {
            const entries = await provider.listHistory({
                profileUsername: profileRow.upload_post_username,
                requestId: post.upload_post_request_id,
                limit: 50,
            })
            for (const entry of entries) {
                if (!entry.success || !entry.platformPostId) {
                    result.failedEntries++
                    console.log('[social-comments] entrada de history fallida, no se crea target', {
                        profileId: profileRow.id,
                        socialPostId: post.id,
                        platform: entry.platform,
                        errorCode: entry.errorCode,
                    })
                    continue
                }
                const { error: upsertError } = await supabase.from('social_post_targets').upsert(
                    {
                        organization_id: post.organization_id,
                        social_post_id: post.id,
                        platform: entry.platform,
                        platform_post_id: entry.platformPostId,
                        post_url: entry.postUrl,
                        published_at: entry.uploadTimestamp ?? post.published_at,
                    },
                    { onConflict: 'social_post_id,platform' },
                )
                if (upsertError) {
                    console.error(
                        '[social-comments] no se pudo upsertear social_post_targets',
                        { profileId: profileRow.id, socialPostId: post.id, platform: entry.platform },
                        upsertError,
                    )
                    continue
                }
                result.synced++
            }
        } catch (e) {
            console.warn(
                '[social-comments] listHistory falló para un post, se salta (el resto sigue)',
                { profileId: profileRow.id, socialPostId: post.id, requestId: post.upload_post_request_id },
                e,
            )
        }
    }

    return result
}

export interface PollableTarget {
    id: string
    organizationId: string
    socialPostId: string
    platform: string
    platformPostId: string
    postUrl: string | null
    publishedAt: string | null
    lastCommentsPollAt: string | null
    /** Caption del `social_posts` dueño — va al `context` del chat para que
     *  el borrador tenga de qué post se está hablando. */
    caption: string
}

const TARGET_CAP = 20

/**
 * Targets de `profileId` a sondear esta corrida: de sus posts publicados en
 * la ventana de `sinceDays`, ordenados por `last_comments_poll_at asc nulls
 * first` (los nunca sondeados o los más viejos primero) y acotados a `cap`
 * (tope de 20 targets por perfil por corrida, del diseño). Dos consultas en
 * vez de un join embebido: `supabase-js` no tiene un patrón establecido en
 * este repo para filtrar por una columna de la tabla relacionada.
 */
export async function listPollableTargets(profileId: string, sinceDays = 7, cap = TARGET_CAP): Promise<PollableTarget[]> {
    const supabase = agentSupabase()
    const sinceIso = new Date(Date.now() - sinceDays * DAY_MS).toISOString()

    const { data: posts, error: postsError } = await supabase
        .from('social_posts')
        .select('id, caption')
        .eq('social_profile_id', profileId)
        .eq('status', 'published')
        .gte('published_at', sinceIso)
        .limit(200)
    if (postsError) {
        console.error('[social-comments] no se pudieron listar los posts publicados del perfil', { profileId }, postsError)
        return []
    }
    const postIds = (posts ?? []).map((p) => p.id)
    if (postIds.length === 0) return []
    const captionByPost = new Map((posts ?? []).map((p) => [p.id, p.caption]))

    const { data: targets, error: targetsError } = await supabase
        .from('social_post_targets')
        .select('*')
        .in('social_post_id', postIds)
        .order('last_comments_poll_at', { ascending: true, nullsFirst: true })
        .limit(cap)
    if (targetsError) {
        console.error('[social-comments] no se pudieron listar los targets a sondear', { profileId }, targetsError)
        return []
    }

    return (targets ?? []).map((t) => ({
        id: t.id,
        organizationId: t.organization_id,
        socialPostId: t.social_post_id,
        platform: t.platform,
        platformPostId: t.platform_post_id,
        postUrl: t.post_url,
        publishedAt: t.published_at,
        lastCommentsPollAt: t.last_comments_poll_at,
        caption: captionByPost.get(t.social_post_id) ?? '',
    }))
}
