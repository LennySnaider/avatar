/**
 * DM privado de Instagram tras responder en público a un comentario
 * (`comments/reply` de Upload-Post, distinto de `comments/create`). Best-
 * effort a propósito: lo llama `deliverViaSocialComment` DESPUÉS de que la
 * respuesta pública ya salió, dentro de su propio try/catch — un fallo aquí
 * NUNCA debe volver `failed` un mensaje que el fan ya vio en público.
 *
 * F4.2 Tarea 4 — EXENTO de `orgTable` por el mismo motivo que el resto de
 * `src/lib/agent/`: lo llama entrega sin sesión (webhook / cron). Todo
 * filtra por el `organization_id` / `avatar_id` de la fila del chat que ya
 * llegó resuelta.
 *
 * @see docs/superpowers/specs — global-constraints.md (comentarios-ia-social)
 */
import { agentSupabase, type SocialProfileRow } from '@/lib/agent/db'
import { commenterIdFromChat, platformFromChat, postIdFromChat } from './ids'
import { commentDmEligibility, sanitizeDmButtons } from './dmEligibility'

/** Lo mínimo del provider que este fichero necesita — evita acoplar a la
 *  interfaz completa de `SocialProvider` sólo para testear/tipar esto. */
export interface PrivateReplyProvider {
    sendInstagramPrivateReply(input: {
        username: string
        commentId: string
        message: string
        buttons?: { title: string; url: string }[]
    }): Promise<{ messageId: string; recipientId: string | null }>
}

export interface MaybeSendCommentDmInput {
    chat: {
        id: string
        organization_id: string
        avatar_id: string
        platform: string
        external_chat_id: string
        context: unknown
    }
    profileRow: SocialProfileRow
    provider: PrivateReplyProvider
    /** `comment_id` del comentario público que se acaba de responder — el
     *  mismo que se usó para `createComment`. */
    commentId: string
    /** `external_created_at` de ese comentario (para la regla de los 7 días). */
    commentTimestamp: string | null
}

export type MaybeSendCommentDmResult = 'sent' | 'failed' | 'skipped'

export async function maybeSendCommentDm(input: MaybeSendCommentDmInput): Promise<MaybeSendCommentDmResult> {
    const { chat, profileRow } = input
    const supabase = agentSupabase()
    const platform = platformFromChat(chat.platform)
    const context = (chat.context ?? {}) as { platformPostId?: string | null }
    const postId = context.platformPostId || postIdFromChat(chat.external_chat_id) || ''
    const commenterId = commenterIdFromChat(chat.external_chat_id)

    // Dedupe: un DM por (avatar, post, comentarista) — la regla del plan,
    // reforzada por el índice único `uq_social_comment_dms_avatar_post_commenter`
    // (migración `20260916110000_social_comment_dms_unico_por_comentarista`).
    // `comment_id` UNIQUE es un cinturón aparte (mismo comentario reintentado),
    // pero NO evita dos comentarios distintos del mismo comentarista en el
    // mismo post procesados en paralelo — de ahí el índice nuevo. Esta select
    // es sólo la comprobación previa para no ni intentarlo; `organization_id`
    // entra también en el filtro (multi-tenant) y `.order + .limit(1)` evita
    // que un `.maybeSingle()` explote si alguna vez hay más de una fila
    // (no debería, con el índice único, pero el propio índice se creó
    // DESPUÉS de esta fila de código — no asumir).
    const { data: existing, error: dedupeError } = await supabase
        .from('social_comment_dms')
        .select('id')
        .eq('organization_id', chat.organization_id)
        .eq('avatar_id', chat.avatar_id)
        .eq('platform_post_id', postId)
        .eq('commenter_id', commenterId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    if (dedupeError) {
        // Sin saber si ya se mandó, la opción segura es NO mandar — un DM de
        // más es peor que uno de menos (spam a un fan). Se deja rastro claro.
        console.error(
            '[social] DM privado: no se pudo comprobar si ya se había mandado (se omite por seguridad)',
            { avatarId: chat.avatar_id, chatId: chat.id, commentId: input.commentId },
            dedupeError,
        )
        return 'skipped'
    }

    const gate = commentDmEligibility({
        platform,
        dmEnabled: profileRow.ai_comment_dm_enabled,
        dmText: profileRow.ai_comment_dm_text,
        commentTimestamp: input.commentTimestamp,
        now: new Date(),
        alreadySent: Boolean(existing),
    })
    if (!gate.eligible) {
        console.log('[social] DM privado omitido', {
            avatarId: chat.avatar_id,
            chatId: chat.id,
            commentId: input.commentId,
            reason: gate.reason,
        })
        return 'skipped'
    }

    const rawButtons = profileRow.ai_comment_dm_buttons
    const buttons = sanitizeDmButtons(rawButtons)
    if (Array.isArray(rawButtons) && buttons.length < rawButtons.length) {
        console.warn('[social] algunos botones del DM no cumplían el formato de Instagram y se descartaron', {
            avatarId: chat.avatar_id,
            total: rawButtons.length,
            validos: buttons.length,
        })
    }

    const dmText = (profileRow.ai_comment_dm_text ?? '').trim()

    try {
        await input.provider.sendInstagramPrivateReply({
            username: profileRow.upload_post_username,
            commentId: input.commentId,
            message: dmText,
            buttons: buttons.length ? buttons : undefined,
        })
        const { error } = await supabase.from('social_comment_dms').insert({
            organization_id: chat.organization_id,
            avatar_id: chat.avatar_id,
            platform: platform ?? 'instagram',
            platform_post_id: postId,
            comment_id: input.commentId,
            commenter_id: commenterId,
            status: 'sent',
            sent_at: new Date().toISOString(),
        })
        if (error) {
            // `duplicate key` cubre CUALQUIERA de los dos índices únicos de la
            // tabla (`comment_id` o `uq_social_comment_dms_avatar_post_commenter`
            // — Postgres da el mismo patrón de mensaje para los dos, así que el
            // regex no necesita distinguirlos). Es la carrera del Important 1:
            // otro worker procesó, en paralelo, un comentario distinto del
            // MISMO comentarista en el MISMO post y ganó la inserción. El DM YA
            // SALIÓ igual (la llamada a `sendInstagramPrivateReply` de arriba ya
            // se hizo) — no se manda dos veces, sólo se deja de registrar esta
            // fila porque la del otro worker ya lo hace. No es un fallo.
            if (/duplicate key/i.test(error.message)) {
                console.warn('[social] DM ya registrado por otra ejecución concurrente (mismo comentarista+post)', {
                    avatarId: chat.avatar_id,
                    platformPostId: postId,
                    commenterId,
                    commentId: input.commentId,
                })
                return 'skipped'
            }
            throw new Error(error.message)
        }
        return 'sent'
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        console.error(
            '[social] DM privado falló',
            { avatarId: chat.avatar_id, chatId: chat.id, commentId: input.commentId },
            message,
        )
        const { error: insertError } = await supabase.from('social_comment_dms').insert({
            organization_id: chat.organization_id,
            avatar_id: chat.avatar_id,
            platform: platform ?? 'instagram',
            platform_post_id: postId,
            comment_id: input.commentId,
            commenter_id: commenterId,
            status: 'failed',
            error: message,
        })
        if (insertError) {
            if (/duplicate key/i.test(insertError.message)) {
                console.warn('[social] DM ya registrado por otra ejecución concurrente (mismo comentarista+post)', {
                    avatarId: chat.avatar_id,
                    platformPostId: postId,
                    commenterId,
                    commentId: input.commentId,
                })
                return 'skipped'
            }
            // Ni se pudo mandar NI se pudo dejar rastro del fallo — esto es lo
            // más cerca de un fallo silencioso que puede pasar aquí, así que
            // se loguea aparte con todo el contexto para no perderlo.
            console.error(
                '[social] DM privado falló Y no se pudo registrar la fila `failed`',
                { avatarId: chat.avatar_id, chatId: chat.id, commentId: input.commentId },
                insertError,
            )
        }
        return 'failed'
    }
}
