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
import { assertActiveProfile } from '@/lib/social/profileGuard'
import { UploadPostProviderError } from '@/lib/social/providers/UploadPostProvider'
import { ingestMessage, resolveAvatarTargetById, touchFanMemory, upsertChat } from '@/lib/agent/inboxSync'
import { generateDraftReply } from '@/lib/agent/draftPipeline'
import { maybeAutopilotSend } from '@/lib/agent/autopilot'
import { encodeCommentChatId, toSocialChatPlatform } from './ids'
import { shouldDraftCommentReply } from './gate'
import { toSocialCommentSettings } from './settings'
import { listPollableTargets, type PollableTarget } from './targets'
import {
    filterOutOwnReplies,
    isOwnComment,
    pickCommenterId,
    rateLimitLow,
    shouldStopPaging,
    targetPlatformConnected,
} from './pollRules'
import type { Platform } from '@/@types/social'

const SINCE_DAYS = 7
const TARGET_CAP = 20
const PAGE_LIMIT = 50

/**
 * Tope de borradores (llamadas al LLM) por perfil y por corrida.
 *
 * Por qué 30: sin tope, un perfil con 20 targets × 3 páginas × 50
 * comentarios podía disparar hasta 3.000 llamadas al modelo dentro de una
 * función con `maxDuration = 120` — se corta a la mitad por timeout, con la
 * mitad de la factura gastada y sin dejar rastro de qué quedó sin hacer. 30
 * borradores caben de sobra en 120 s (≈2-3 s cada uno) y cubren el volumen
 * real de comentarios entre dos corridas del cron (cada 5 min).
 *
 * Pasado el tope los comentarios SE SIGUEN INGIRIENDO (no se pierde
 * ninguno): sólo se deja el hilo marcado `needs_attention` para que el humano
 * lo vea en el Inbox y regenere el borrador a mano.
 */
const DRAFT_BUDGET_PER_PROFILE = 30

/** Motivo que se deja en `agent_chats.attention_reason` cuando el hilo se
 *  quedó sin borrador (presupuesto agotado o el LLM falló). En inglés, igual
 *  que los motivos que escribe el autopilot — es lo que se muestra en el Inbox. */
const NO_DRAFT_REASON = 'Comment without draft — regenerate from the Inbox'

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
    /** Comentarios ingeridos que se quedaron SIN borrador por haberse agotado
     *  `DRAFT_BUDGET_PER_PROFILE` — su hilo queda `needs_attention`. */
    draftBudgetExhausted: number
    /** Plataformas con reauth requerido en esta corrida (una por plataforma afectada, sin duplicar). */
    reauthRequired: string[]
    /** Targets saltados sin llamar al proveedor porque su red ya no está en
     *  `connected_platforms` del perfil (`targetPlatformConnected`). */
    skippedDisconnected: number
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
        draftBudgetExhausted: 0,
        reauthRequired: [],
        skippedDisconnected: 0,
        errors: 0,
    }
}

/**
 * Deja el hilo marcado para revisión humana: el comentario está ingerido
 * pero no tiene borrador (presupuesto agotado, o el LLM falló). Sin esto, ese
 * comentario quedaría en el Inbox indistinguible de uno ya atendido.
 * Un fallo aquí se loguea y no corta la ingesta del resto.
 */
async function flagChatNeedsAttention(organizationId: string, chatId: string): Promise<void> {
    const supabase = agentSupabase()
    const { error } = await supabase
        .from('agent_chats')
        .update({
            needs_attention: true,
            attention_reason: NO_DRAFT_REASON,
            updated_at: new Date().toISOString(),
        })
        .eq('organization_id', organizationId)
        .eq('id', chatId)
    if (error) {
        console.warn('[social-comments] no se pudo marcar el hilo como needs_attention', { chatId }, error)
    }
}

/**
 * Ids de ESTA página que ya existen como mensaje SALIENTE nuestro en la org.
 * Una sola consulta por página (ver `filterOutOwnReplies` para el porqué).
 * Un fallo de la consulta devuelve un set vacío: se pierde el cinturón, no la
 * ingesta — `isOwnComment` sigue siendo el primer filtro.
 */
async function loadOwnOutboundIds(organizationId: string, commentIds: string[]): Promise<Set<string>> {
    if (commentIds.length === 0) return new Set()
    const supabase = agentSupabase()
    const { data, error } = await supabase
        .from('agent_messages')
        .select('external_message_id')
        .eq('organization_id', organizationId)
        .eq('direction', 'out')
        .in('external_message_id', commentIds)
    if (error) {
        console.warn('[social-comments] no se pudo comprobar si la página trae respuestas nuestras', { organizationId }, error)
        return new Set()
    }
    const ids = new Set<string>()
    for (const row of data ?? []) {
        if (row.external_message_id) ids.add(row.external_message_id)
    }
    return ids
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
        /** Borradores ya intentados en ESTE perfil, compartido entre targets
         *  (el presupuesto es por perfil y corrida, no por target). */
        draftBudget: { used: number }
    },
): Promise<'rate_limited' | 'done'> {
    const { resolvedTarget, settings, provider, result, draftBudget } = ctx
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

        result.comments += commentsPage.comments.length

        // Cinturón contra el bucle de auto-respuesta ANTES de ingerir nada:
        // una respuesta pública nuestra que vuelve en el listado (X la
        // devuelve por el timeline de menciones, donde `accountName` es el
        // nombre para mostrar y no siempre casa con el @handle) se
        // reconocería como "fan nuevo" y se contestaría a sí misma.
        const knownOutboundIds = await loadOwnOutboundIds(
            resolvedTarget.organizationId,
            commentsPage.comments.map((c) => c.id),
        )
        const pageComments = filterOutOwnReplies(commentsPage.comments, knownOutboundIds)
        result.skippedOwn += commentsPage.comments.length - pageComments.length

        for (const comment of pageComments) {
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
                if (draftBudget.used >= DRAFT_BUDGET_PER_PROFILE) {
                    // Presupuesto agotado: el comentario YA quedó ingerido, sólo
                    // se salta el LLM. El hilo queda marcado para que el humano
                    // lo encuentre en el Inbox y regenere el borrador.
                    result.draftBudgetExhausted++
                    await flagChatNeedsAttention(resolvedTarget.organizationId, chat.id)
                    continue
                }
                draftBudget.used++
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
                    // del resto de comentarios de este target — pero tampoco
                    // puede dejar el hilo mudo y sin avisar a nadie.
                    console.warn('[social-comments] draft/autopilot falló', { profileId: settings.profileId, chatId: chat.id }, e)
                    await flagChatNeedsAttention(resolvedTarget.organizationId, chat.id)
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
        assertActiveProfile(profileRow)
        provider = getSocialProvider()
    } catch (e) {
        console.warn('[social-comments] no hay provider utilizable, se omite el sondeo', { profileId: profileRow.id }, e)
        return result
    }

    const targets = await listPollableTargets(profileRow.id, profileRow.organization_id, sinceDays, TARGET_CAP)
    const reauthPlatforms = new Set<string>()
    const draftBudget = { used: 0 }

    for (const target of targets) {
        if (reauthPlatforms.has(target.platform)) {
            // Se salta por la reauth de su plataforma, pero SÍ se le estampa
            // `last_comments_poll_at`: si no, estos targets se quedan
            // eternamente primeros en la cola (`asc nulls first`) y se comen
            // el cupo de 20 de cada corrida sin dejar sitio a los demás.
            await markTargetPolled(target.id, target.organizationId)
            continue
        }

        if (!targetPlatformConnected(target.platform, settings.ownAccounts)) {
            // Red desconectada: el proveedor contestaría 400 en cada vuelta.
            // Se estampa igual que arriba para que no acapare el cupo de 20.
            result.skippedDisconnected++
            await markTargetPolled(target.id, target.organizationId)
            continue
        }

        try {
            const outcome = await pollOneTarget(target, { resolvedTarget, settings, provider, result, draftBudget })
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
                await markTargetPolled(target.id, target.organizationId)
                continue
            }
            result.errors++
            console.warn(
                '[social-comments] target de comentarios falló, se salta (el resto del perfil sigue)',
                { profileId: profileRow.id, targetId: target.id, platform: target.platform },
                e,
            )
            // Mismo motivo que arriba: un target que falla siempre no puede
            // acaparar el cupo de 20 corrida tras corrida. Se reintenta en la
            // rotación normal, no el primero de la fila.
            await markTargetPolled(target.id, target.organizationId)
        }
    }

    return result
}
