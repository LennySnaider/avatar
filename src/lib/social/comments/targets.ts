/**
 * Sincroniza `social_post_targets` desde el historial de Upload-Post y lista
 * los targets pendientes de sondeo. Session-less (lo llama el cron): sin
 * `orgTable`, todo cuelga del `organization_id` de las filas ya cargadas
 * (`social_posts`/`social_profiles`), nunca de un id suelto.
 *
 * Fichero con IO — no se testea unitariamente (regla de
 * `global-constraints.md`: "pure files get tests, no mocks of Supabase" — lo
 * que le falta a este fichero es justo eso, ser puro). El import de
 * `agentSupabase` es estático a propósito, a diferencia de `settings.ts`:
 * ningún test intenta importar este fichero.
 *
 * @see docs/superpowers/specs — task-5-brief.md / global-constraints.md (comentarios-ia-social)
 */
import { agentSupabase, type SocialProfileRow } from '@/lib/agent/db'
import { getSocialProvider } from '@/lib/social/provider'
import { assertActiveProfile } from '@/lib/social/profileGuard'
import { UploadPostProviderError } from '@/lib/social/providers/UploadPostProvider'
import { chunk, postNeedsSync, rateLimitLow } from './pollRules'

const DAY_MS = 24 * 60 * 60 * 1000
/**
 * Tope de posts a los que de verdad hay que llamarles `listHistory` por
 * corrida — se aplica DESPUÉS de descartar los que ya tienen target para
 * todas sus plataformas (ver `postsNeedingSync` abajo), no sobre el total de
 * posts publicados en la ventana. Aplicarlo antes (como en la primera
 * versión de este fichero) dejaba los posts incompletos MÁS VIEJOS fuera del
 * slice para siempre en un perfil con más de este número de posts publicados
 * en 7 días: el corte era estable entre corridas y nunca les llegaba el
 * turno.
 */
const POSTS_PER_RUN_CAP = 50
/** Techo de seguridad sobre cuántos posts publicados se leen ANTES de saber
 *  cuáles necesitan sincronizarse — no es el tope real (ese es
 *  `POSTS_PER_RUN_CAP`, aplicado después de filtrar). Sólo actúa si un
 *  perfil publica más de 500 veces en 7 días, lo cual no pasa hoy. */
const CANDIDATE_POSTS_CAP = 500
/** `.in('social_post_id', ids)` se manda en tandas de a lo sumo esto — con
 *  hasta `CANDIDATE_POSTS_CAP` ids en una sola llamada, el query string
 *  (~18KB con 500 UUIDs) puede pegarle al límite de URL de PostgREST/Kong. */
const EXISTING_TARGETS_CHUNK_SIZE = 100

export interface SyncPostTargetsResult {
    /** Targets creados o actualizados (entradas `success && platformPostId` del history). */
    synced: number
    /** Entradas del history con `success=false` (publicó bien en una red, falló en otra). */
    failedEntries: number
    /** true si un 401 `*_reauth_required` cortó el resto de la sincronización
     *  de este perfil en esta corrida (todas las plataformas comparten el
     *  mismo `listHistory`, a diferencia del sondeo de comentarios — no hay
     *  una plataforma concreta a la que atribuírselo). */
    reauth: boolean
}

/**
 * Un post `published` puede tener publicaciones reales en varias
 * plataformas (una por elemento de `social_posts.platforms`) y a cada una le
 * corresponde su propio `platform_post_id` real. Esta función busca los
 * posts publicados de `profileRow` en la ventana de `sinceDays` que
 * `postNeedsSync` (pollRules.ts) marca como pendientes — sin NINGÚN target
 * todavía, o publicados hace menos de 2 horas —, pide el history de
 * Upload-Post por `request_id` (una llamada cubre todas las plataformas de
 * ESE post) y upsertea un target por cada entrada `success=true` con
 * `platformPostId`. Las entradas `success=false` (falló en esa plataforma
 * concreta) se loguean, no se guardan — no hay `platform_post_id` real que
 * guardar, y un post asentado (≥1 target, publicado hace más de 2h) no
 * vuelve a pedirse aunque le falte una plataforma: esa falta ya quedó
 * logueada la primera vez que se vio.
 */
export async function syncPostTargets(profileRow: SocialProfileRow, sinceDays = 7): Promise<SyncPostTargetsResult> {
    const result: SyncPostTargetsResult = { synced: 0, failedEntries: 0, reauth: false }
    const supabase = agentSupabase()
    const sinceIso = new Date(Date.now() - sinceDays * DAY_MS).toISOString()

    const { data: candidatePosts, error: postsError } = await supabase
        .from('social_posts')
        .select('id, organization_id, published_at, upload_post_request_id, caption')
        .eq('social_profile_id', profileRow.id)
        .eq('organization_id', profileRow.organization_id)
        .eq('status', 'published')
        .not('upload_post_request_id', 'is', null)
        .gte('published_at', sinceIso)
        .order('published_at', { ascending: false })
        .limit(CANDIDATE_POSTS_CAP)
    if (postsError) {
        console.error(
            '[social-comments] no se pudieron listar los posts publicados para sincronizar targets',
            { profileId: profileRow.id },
            postsError,
        )
        return result
    }
    if (!candidatePosts || candidatePosts.length === 0) return result

    const candidateIds = candidatePosts.map((p) => p.id)
    // En tandas de 100 ids por llamada, no una sola con hasta
    // CANDIDATE_POSTS_CAP (500) — ver EXISTING_TARGETS_CHUNK_SIZE. Un fallo
    // en CUALQUIER tanda aborta la sincronización de este perfil (igual que
    // antes con la única consulta): sin saber qué targets ya existen no se
    // puede decidir con seguridad qué posts necesitan `listHistory`.
    const existingByPost = new Map<string, Set<string>>()
    for (const idsChunk of chunk(candidateIds, EXISTING_TARGETS_CHUNK_SIZE)) {
        const { data: existingTargets, error: targetsError } = await supabase
            .from('social_post_targets')
            .select('social_post_id, platform')
            .eq('organization_id', profileRow.organization_id)
            .in('social_post_id', idsChunk)
        if (targetsError) {
            console.error(
                '[social-comments] no se pudieron leer los targets existentes',
                { profileId: profileRow.id },
                targetsError,
            )
            return result
        }
        for (const t of existingTargets ?? []) {
            const set = existingByPost.get(t.social_post_id) ?? new Set<string>()
            set.add(t.platform)
            existingByPost.set(t.social_post_id, set)
        }
    }

    // Sólo los posts que `postNeedsSync` marca como pendientes, más
    // recientes primero (candidatePosts ya viene ordenado) — el tope real
    // se aplica AQUÍ, sobre lo que hace falta trabajar, no sobre el total
    // publicado. Medido en vivo (2026-09-16, Emily, `?sinceDays=30`): sin
    // este corte por edad, un post con una plataforma que FALLÓ (nunca iba
    // a tener target) se re-enviaba a `listHistory` en cada corrida del
    // cron, para siempre.
    const now = new Date()
    const postsNeedingSync = candidatePosts.filter((post) =>
        postNeedsSync({
            publishedAt: post.published_at,
            targetCount: (existingByPost.get(post.id) ?? new Set<string>()).size,
            now,
        }),
    )
    if (postsNeedingSync.length === 0) return result
    const postsToSync = postsNeedingSync.slice(0, POSTS_PER_RUN_CAP)

    let provider
    try {
        assertActiveProfile(profileRow)
        provider = getSocialProvider()
    } catch (e) {
        console.warn('[social-comments] no hay provider utilizable para sincronizar targets', { profileId: profileRow.id }, e)
        return result
    }

    for (const post of postsToSync) {
        if (!post.upload_post_request_id) continue // ya filtrado en el SELECT, cinturón para el tipo

        if (rateLimitLow(provider.getLastRateLimit())) {
            console.warn('[social-comments] rate limit bajo, se corta la sincronización de targets de este perfil', {
                profileId: profileRow.id,
                remaining: provider.getLastRateLimit()?.remaining,
            })
            break
        }

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
            if (e instanceof UploadPostProviderError && e.isReauthRequired) {
                // Un 401 reauth de listHistory no es "esta plataforma" (a
                // diferencia de listComments): el history de un post cubre
                // TODAS sus plataformas en una sola llamada, así que no hay
                // una plataforma concreta a la que atribuírselo — se corta
                // la sincronización del PERFIL entero en esta corrida.
                console.warn('[social-comments] reauth requerido, se corta la sincronización de targets de este perfil', {
                    profileId: profileRow.id,
                })
                result.reauth = true
                break
            }
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

/** Misma razón que `EXISTING_TARGETS_CHUNK_SIZE`: hasta 200 ids de posts en un
 *  solo `.in(...)` son ~7KB de query string. */
const POLLABLE_TARGETS_CHUNK_SIZE = 100

/** Fila cruda de `social_post_targets` — sólo las columnas que este módulo
 *  mira para ordenar y mapear (el select es `*`). */
type PollableTargetRow = {
    id: string
    organization_id: string
    social_post_id: string
    platform: string
    platform_post_id: string
    post_url: string | null
    published_at: string | null
    last_comments_poll_at: string | null
}

/** `last_comments_poll_at asc nulls first`, en JS: el mismo orden que pedía
 *  la consulta única, rehecho sobre la unión de las tandas. */
function pollOrder(a: PollableTargetRow, b: PollableTargetRow): number {
    if (a.last_comments_poll_at === b.last_comments_poll_at) return 0
    if (a.last_comments_poll_at === null) return -1
    if (b.last_comments_poll_at === null) return 1
    return a.last_comments_poll_at < b.last_comments_poll_at ? -1 : 1
}

/**
 * Targets de `profileId` a sondear esta corrida: de sus posts publicados en
 * la ventana de `sinceDays`, ordenados por `last_comments_poll_at asc nulls
 * first` (los nunca sondeados o los más viejos primero) y acotados a `cap`
 * (tope de 20 targets por perfil por corrida, del diseño). Dos consultas en
 * vez de un join embebido: `supabase-js` no tiene un patrón establecido en
 * este repo para filtrar por una columna de la tabla relacionada.
 *
 * La primera consulta (posts publicados) va ordenada por `published_at desc`
 * y acotada a 200 — un techo de seguridad, no el tope real (ese es `cap`,
 * sobre los targets ya ordenados por `last_comments_poll_at`): si un perfil
 * tuviera más de 200 posts publicados en la ventana, los de targets más
 * antiguos podrían quedar fuera de este lote, pero la SIGUIENTE corrida los
 * recoge igual (el orden es determinista, no una porción arbitraria).
 */
export async function listPollableTargets(
    profileId: string,
    organizationId: string,
    sinceDays = 7,
    cap = TARGET_CAP,
): Promise<PollableTarget[]> {
    const supabase = agentSupabase()
    const sinceIso = new Date(Date.now() - sinceDays * DAY_MS).toISOString()

    const { data: posts, error: postsError } = await supabase
        .from('social_posts')
        .select('id, caption')
        .eq('social_profile_id', profileId)
        .eq('organization_id', organizationId)
        .eq('status', 'published')
        .gte('published_at', sinceIso)
        .order('published_at', { ascending: false })
        .limit(200)
    if (postsError) {
        console.error('[social-comments] no se pudieron listar los posts publicados del perfil', { profileId }, postsError)
        return []
    }
    const postIds = (posts ?? []).map((p) => p.id)
    if (postIds.length === 0) return []
    const captionByPost = new Map((posts ?? []).map((p) => [p.id, p.caption]))

    // En tandas de 100 ids, igual que `syncPostTargets` — hasta 200 posts en
    // un solo `.in(...)` son ~7KB de query string, cerca del límite de URL de
    // PostgREST/Kong. Cada tanda trae ya ordenada y acotada a `cap` sus
    // propios candidatos; el orden GLOBAL (y el corte a `cap`) se rehace
    // abajo sobre la unión, que es lo que la BD hacía en una sola consulta.
    const targets: PollableTargetRow[] = []
    for (const idsChunk of chunk(postIds, POLLABLE_TARGETS_CHUNK_SIZE)) {
        const { data, error: targetsError } = await supabase
            .from('social_post_targets')
            .select('*')
            .eq('organization_id', organizationId)
            .in('social_post_id', idsChunk)
            .order('last_comments_poll_at', { ascending: true, nullsFirst: true })
            .limit(cap)
        if (targetsError) {
            console.error('[social-comments] no se pudieron listar los targets a sondear', { profileId }, targetsError)
            return []
        }
        targets.push(...((data ?? []) as PollableTargetRow[]))
    }

    return targets
        .sort(pollOrder)
        .slice(0, cap)
        .map((t) => ({
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
