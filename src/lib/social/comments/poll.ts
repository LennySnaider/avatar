/**
 * Sondeo de comentarios de un perfil: por cada target pendiente
 * (`listPollableTargets`), pagina `listComments` de Upload-Post, ingiere los
 * comentarios nuevos al Inbox del agente (mismas primitivas que Fanvue/
 * Telegram: `upsertChat`/`ingestMessage`/`touchFanMemory`) y dispara
 * borrador + autopilot igual que el resto del módulo.
 *
 * Resiliencia POR TARGET, mismo patrón que `agent-inbox-poll`: un target que
 * falla (network, 5xx, forma inesperada) se loguea y se salta; el resto del
 * perfil sigue. Dos excepciones que SÍ cortan más que un target:
 *  - Rate limit bajo (`remaining < 5`): corta el barrido de TODO el perfil —
 *    los targets siguientes en la lista (ordenada por `last_comments_poll_at
 *    asc nulls first`) quedan con su timestamp SIN tocar, así que la
 *    corrida siguiente los recoge primero. Auto-corrector, no hace falta
 *    guardar dónde se quedó.
 *  - Reauth requerido (401 `*_reauth_required`) para una plataforma: se
 *    salta el resto de los targets de ESA plataforma en esta corrida (las
 *    demás plataformas del mismo perfil siguen normal).
 *
 * Fichero con IO — no se testea unitariamente; sus decisiones puras viven en
 * `pollRules.ts` (sí testeado).
 *
 * @see docs/superpowers/specs — task-5-brief.md / global-constraints.md (comentarios-ia-social)
 */
import { agentSupabase, type SocialProfileRow } from '@/lib/agent/db'
import { getSocialProvider } from '@/lib/social/provider'
import { resolveProfileKey } from '@/lib/social/profileKey'
import { UploadPostProviderError } from '@/lib/social/providers/UploadPostProvider'
import { ingestMessage, resolveAvatarTargetById, touchFanMemory, upsertChat } from '@/lib/agent/inboxSync'
import { generateDraftReply } from '@/lib/agent/draftPipeline'
import { maybeAutopilotSend } from '@/lib/agent/autopilot'
import { encodeCommentChatId, toSocialChatPlatform } from './ids'
import { shouldDraftCommentReply } from './gate'
import { toSocialCommentSettings } from './settings'
import { listPollableTargets, type PollableTarget } from './targets'
import { isOwnComment, pickCommenterId, rateLimitLow, shouldStopPaging } from './pollRules'
import type { Platform } from '@/@types/social'

const SINCE_DAYS = 7
const TARGET_CAP = 20
const PAGE_LIMIT = 50

export interface PollProfileOptions {
    /** Ventana de días hacia atrás para buscar posts publicados —
     *  default `SINCE_DAYS` (7). Override para pruebas manuales del cron
     *  (query param `sinceDays`, acotado por `clampSinceDays`); Vercel
     *  Scheduled Functions llama sin query string, así que en producción
     *  esto siempre cae al default. */
    sinceDays?: number
}

export interface PollProfileResult {
    /** Targets efectivamente procesados (se llegó a pedir al menos su primera página). */
    targets: number
    /** Comentarios vistos en total (incluye propios y ya conocidos). */
    comments: number
    /** Comentarios nuevos ingeridos (`ingestMessage(...).inserted === true`). */
    newComments: number
    drafts: number
    autoQueued: number
    skippedOwn: number
    /** Plataformas con reauth requerido en esta corrida (una por plataforma afectada, sin duplicar). */
    reauthRequired: string[]
    errors: number
}

function emptyResult(): PollProfileResult {
    return {
        targets: 0,
        comments: 0,
        newComments: 0,
        drafts: 0,
        autoQueued: 0,
        skippedOwn: 0,
        reauthRequired: [],
        errors: 0,
    }
}

async function markTargetPolled(targetId: string, organizationId: string): Promise<void> {
    const supabase = agentSupabase()
    const { error } = await supabase
        .from('social_post_targets')
        .update({ last_comments_poll_at: new Date().toISOString() })
        .eq('organization_id', organizationId)
        .eq('id', targetId)
    if (error) {
        console.warn('[social-comments] no se pudo marcar el target como sondeado', { targetId }, error)
    }
}

/** Procesa un target: pagina sus comentarios (max 3 páginas), ingiere los
 *  nuevos, dispara borrador/autopilot. Lanza (no captura) para que el
 *  llamador decida cómo tratar reauth vs. cualquier otro error. */
async function pollOneTarget(
    target: PollableTarget,
    ctx: {
        resolvedTarget: Awaited<ReturnType<typeof resolveAvatarTargetById>>
        settings: ReturnType<typeof toSocialCommentSettings>
        provider: ReturnType<typeof getSocialProvider>
        result: PollProfileResult
    },
): Promise<'rate_limited' | 'done'> {
    const { resolvedTarget, settings, provider, result } = ctx
    if (!resolvedTarget) throw new Error('resolvedTarget ausente') // no debería pasar, ver llamador

    let after: string | undefined
    let page = 0
    let sawKnown = false

    for (;;) {
        if (rateLimitLow(provider.getLastRateLimit())) {
            console.warn('[social-comments] rate limit bajo, se corta el sondeo de este perfil', {
                profileId: settings.profileId,
                remaining: provider.getLastRateLimit()?.remaining,
            })
            return 'rate_limited'
        }

        page++
        const commentsPage = await provider.listComments({
            username: settings.uploadPostUsername,
            platform: target.platform as Platform,
            postId: target.platformPostId,
            limit: PAGE_LIMIT,
            after,
        })
        // Se cuenta el target como "procesado" recién aquí — se llegó a
        // pedir (y recibir respuesta de) su primera página. Si el rate
        // limit corta ANTES de este punto (arriba), o la propia petición
        // lanza, el target nunca llega a esta línea y no se cuenta.
        if (page === 1) result.targets++

        for (const comment of commentsPage.comments) {
            result.comments++

            if (isOwnComment(comment, settings.ownAccounts, target.platform)) {
                result.skippedOwn++
                continue
            }
            const commenterId = pickCommenterId(comment)
            if (!commenterId) {
                console.warn('[social-comments] comentario sin authorId ni authorUsername, se omite', {
                    profileId: settings.profileId,
                    targetId: target.id,
                    commentId: comment.id,
                })
                continue
            }

            const chat = await upsertChat({
                target: resolvedTarget,
                platform: toSocialChatPlatform(target.platform),
                fanUuid: encodeCommentChatId(target.platformPostId, commenterId),
                fanDisplayName: comment.authorUsername,
                fanHandle: comment.authorUsername,
                isCreator: false,
                lastMessageAt: comment.timestamp,
                lastFanMessageAt: comment.timestamp,
                defaultMode: settings.aiDefaultChatMode,
                context: {
                    socialPostTargetId: target.id,
                    platformPostId: target.platformPostId,
                    postUrl: target.postUrl,
                    caption: target.caption,
                },
            })

            const { inserted } = await ingestMessage({
                organizationId: resolvedTarget.organizationId,
                chatId: chat.id,
                direction: 'in',
                externalMessageId: comment.id,
                text: comment.text,
                externalCreatedAt: comment.timestamp,
            })
            if (!inserted) {
                // Ya lo teníamos: llegamos al punto donde el sondeo anterior
                // se quedó — esta página es la última que hace falta pedir.
                sawKnown = true
                continue
            }
            result.newComments++
            await touchFanMemory(resolvedTarget, commenterId, comment.authorUsername, target.platform)

            if (
                shouldDraftCommentReply({
                    aiRepliesEnabled: settings.aiRepliesEnabled,
                    inserted,
                    isOwnComment: false,
                    chatMode: chat.mode,
                    text: comment.text,
                })
            ) {
                try {
                    const draft = await generateDraftReply(chat.id)
                    if (draft) {
                        result.drafts++
                        if (chat.mode === 'auto') {
                            const outcome = await maybeAutopilotSend(chat.id, draft.messageId)
                            if (outcome === 'scheduled') result.autoQueued++
                        }
                    }
                } catch (e) {
                    // Un fallo del LLM/autopilot no puede tumbar la ingesta
                    // del resto de comentarios de este target.
                    console.warn('[social-comments] draft/autopilot falló', { profileId: settings.profileId, chatId: chat.id }, e)
                }
            }
        }

        if (
            shouldStopPaging({
                page,
                hasNext: commentsPage.hasNext,
                hasCursor: Boolean(commentsPage.nextCursor),
                sawKnown,
            })
        )
            break
        after = commentsPage.nextCursor ?? undefined
    }

    return 'done'
}

export async function pollProfileComments(
    profileRow: SocialProfileRow,
    options: PollProfileOptions = {},
): Promise<PollProfileResult> {
    const sinceDays = options.sinceDays ?? SINCE_DAYS
    const result = emptyResult()
    if (!profileRow.avatar_id) {
        console.warn('[social-comments] perfil sin avatar_id, se omite el sondeo', { profileId: profileRow.id })
        return result
    }

    const settings = toSocialCommentSettings(profileRow)
    const resolvedTarget = await resolveAvatarTargetById(profileRow.avatar_id)
    if (!resolvedTarget) {
        console.warn('[social-comments] no se pudo resolver el avatar del perfil, se omite el sondeo', {
            profileId: profileRow.id,
            avatarId: profileRow.avatar_id,
        })
        return result
    }

    let provider
    try {
        provider = getSocialProvider(resolveProfileKey(profileRow))
    } catch (e) {
        console.warn('[social-comments] no hay provider utilizable, se omite el sondeo', { profileId: profileRow.id }, e)
        return result
    }

    const targets = await listPollableTargets(profileRow.id, profileRow.organization_id, sinceDays, TARGET_CAP)
    const reauthPlatforms = new Set<string>()

    for (const target of targets) {
        if (reauthPlatforms.has(target.platform)) continue

        try {
            const outcome = await pollOneTarget(target, { resolvedTarget, settings, provider, result })
            if (outcome === 'rate_limited') {
                // El límite ya se logueó dentro de pollOneTarget. Este target
                // se deja SIN marcar como sondeado (se procesó parcial o
                // nada) para que la corrida siguiente lo retome primero.
                return result
            }
            await markTargetPolled(target.id, target.organizationId)
        } catch (e) {
            if (e instanceof UploadPostProviderError && e.isReauthRequired) {
                console.warn('[social-comments] reauth requerido, se salta el resto de esta plataforma', {
                    profileId: profileRow.id,
                    platform: target.platform,
                })
                reauthPlatforms.add(target.platform)
                result.reauthRequired.push(target.platform)
                continue
            }
            result.errors++
            console.warn(
                '[social-comments] target de comentarios falló, se salta (el resto del perfil sigue)',
                { profileId: profileRow.id, targetId: target.id, platform: target.platform },
                e,
            )
        }
    }

    return result
}
