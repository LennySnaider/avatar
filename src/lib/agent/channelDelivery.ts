/**
 * Entrega de un TEXTO ya aprobado por el canal del chat.
 *
 * Antes esto vivía dentro de `sendAgentMessage` cableado a Fanvue. Ahora
 * `sendAgentMessage` decide estado, contadores y memoria, y ESTE fichero
 * decide por dónde sale el mensaje. La rama de Fanvue es el bloque original
 * movido tal cual: mismo cliente, mismas llamadas, mismo resultado.
 *
 * F4.2 Tarea 4 (comentarios-ia-social) — `deliverAgentText` despacha con un
 * `switch` EXHAUSTIVO (guarda `never`) en vez del `if/else` de dos ramas de
 * antes: ese `if/else` mandaba CUALQUIER cosa que no fuera Telegram por
 * Fanvue, y un chat `social:*` es justamente "cualquier cosa que no sea
 * Telegram" — se habría entregado en el chat privado de Fanvue de otra
 * persona. La revisión de la Tarea 3 lo marcó; se cierra aquí.
 *
 * F4.2 Tarea 4 — EXENTO de `orgTable` por el mismo motivo que
 * `sendMessage.ts`: lo llama el flush de autopilot desde el cron, sin
 * sesión. `chat` llega ya resuelto y acotado por `organization_id` desde
 * `sendAgentMessage`; aquí no se navega por ids sueltos.
 *
 * El token del bot se pide con `loadTelegramBotToken` y se suelta en la
 * misma función: no se guarda, no se loguea, no se devuelve (CANDADO 2 de
 * AgentTelegramService.ts).
 */
import { agentSupabase } from './db'
import { makeFanvueClient } from './inboxSync'
import { resolveDeliveryChannel } from './channelRouting'
import { loadConnection } from '@/lib/fanvue/tokenStore'
import { loadTelegramBotToken, loadTelegramSettings } from '@/lib/telegram/settings'
import { sendMessage as telegramSendMessage } from '@/lib/telegram/client'
import { platformFromChat, postIdFromChat } from '@/lib/social/comments/ids'
import { resolveProfileKey } from '@/lib/social/profileKey'
import { getSocialProvider } from '@/lib/social/provider'
import { maybeSendCommentDm } from '@/lib/social/comments/privateReply'
import { ALL_PLATFORMS, type Platform } from '@/@types/social'

export interface DeliverableChat {
    id: string
    organization_id: string
    avatar_id: string
    platform: string
    external_chat_id: string
    /** Contexto del post bajo el que se comenta — sólo lo USAN los chats
     *  `social:*` (`agent_chats.context`), pero la columna existe (y viaja)
     *  para cualquier chat: siempre `null` en Fanvue/Telegram. `unknown` a
     *  propósito: este fichero no impone su forma, `deliverViaSocialComment`
     *  sí. */
    context: unknown
}

export interface DeliveryResult {
    externalMessageId: string
}

export async function deliverAgentText(chat: DeliverableChat, text: string): Promise<DeliveryResult> {
    const channel = resolveDeliveryChannel(chat.platform)
    switch (channel) {
        case 'telegram':
            return deliverViaTelegram(chat, text)
        case 'social_comment':
            return deliverViaSocialComment(chat, text)
        case 'fanvue':
            return deliverViaFanvue(chat, text)
        default: {
            // Guarda `never`: si `DeliveryChannel` gana un valor nuevo y este
            // switch no se actualiza, esto deja de compilar en vez de caer
            // en silencio a Fanvue — que es justo el bug que la revisión de
            // la Tarea 3 marcó (un chat `social:*` entregándose por Fanvue).
            const exhaustive: never = channel
            throw new Error(`Canal de entrega sin manejar: ${exhaustive}`)
        }
    }
}

async function deliverViaTelegram(chat: DeliverableChat, text: string): Promise<DeliveryResult> {
    // Desconectar un bot (`disconnectTelegramBot`) pone `enabled = false` pero
    // CONSERVA el token, para poder reconectar sin volver a pedírselo al
    // creador. Mirar sólo si hay token, por tanto, no es mirar si el bot está
    // conectado: un bot que el creador apagó seguía contestando por él. El
    // mensaje queda `failed` con este motivo, que es lo correcto — no se
    // entregó, y el inbox lo enseña.
    const settings = await loadTelegramSettings(chat.avatar_id)
    if (!settings?.enabled) throw new Error('Telegram bot not connected')
    const token = await loadTelegramBotToken(chat.avatar_id)
    if (!token) throw new Error('Telegram bot not connected')
    const sent = await telegramSendMessage(token, {
        chat_id: chat.external_chat_id,
        text,
    })
    return { externalMessageId: String(sent.message_id) }
}

/**
 * Entrega de un chat `social:*`: responde en PÚBLICO al comentario vía
 * Upload-Post (`comments/create`), usando como `comment_id` el ÚLTIMO
 * mensaje entrante del chat (Instagram lo exige) y, si el post lo trae en
 * `chat.context`, el `post_id` (TikTok lo exige incluso al responder —
 * inofensivo para el resto de redes).
 *
 * Tras el envío público, intenta el DM privado de Instagram
 * (`maybeSendCommentDm`) dentro de SU PROPIO try/catch: un fallo ahí sólo se
 * loguea — la respuesta pública ya salió y no se vuelve atrás por eso.
 */
async function deliverViaSocialComment(chat: DeliverableChat, text: string): Promise<DeliveryResult> {
    const supabase = agentSupabase()
    const { data: profile, error: profileError } = await supabase
        .from('social_profiles')
        .select('*')
        .eq('avatar_id', chat.avatar_id)
        .eq('organization_id', chat.organization_id)
        .maybeSingle()
    if (profileError) {
        console.error(
            '[social-comment] no se pudo leer social_profiles',
            { chatId: chat.id, avatarId: chat.avatar_id, orgId: chat.organization_id },
            profileError.message,
        )
        throw new Error(`Supabase: ${profileError.message}`)
    }
    if (!profile || profile.status !== 'active') {
        throw new Error('Upload-Post account not connected')
    }
    const key = resolveProfileKey(profile)
    const provider = getSocialProvider(key)

    const platform = platformFromChat(chat.platform)
    if (!platform) throw new Error(`Chat platform is not a social comment channel: ${chat.platform}`)
    if (!ALL_PLATFORMS.includes(platform as Platform)) {
        throw new Error(`Unsupported social platform: ${platform}`)
    }

    // El comentario a responder es el último mensaje entrante RECIBIDO del
    // chat, no cualquiera: un `draft`/`sent` de nuestro lado no es un
    // comentario ajeno. `external_created_at desc nulls last, created_at
    // desc` porque el poll de Tarea 5 puede ingerir comentarios fuera de
    // orden cronológico (páginas de la API) — `created_at` (cuándo LO
    // VIMOS nosotros) desempata cuando ese dato falta.
    const { data: lastInbound, error: lastInboundError } = await supabase
        .from('agent_messages')
        .select('external_message_id, external_created_at')
        .eq('organization_id', chat.organization_id)
        .eq('chat_id', chat.id)
        .eq('direction', 'in')
        .eq('status', 'received')
        .order('external_created_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    if (lastInboundError) {
        console.error(
            '[social-comment] no se pudo leer el último comentario entrante',
            { chatId: chat.id, avatarId: chat.avatar_id, orgId: chat.organization_id },
            lastInboundError.message,
        )
        throw new Error(`Supabase: ${lastInboundError.message}`)
    }
    const commentId = lastInbound?.external_message_id
    if (!commentId) throw new Error('No comment to reply to')

    // Mismo fallback que `privateReply.ts` (postIdFromChat): si el chat no
    // trae `platformPostId` en `context` (no debería pasar para un chat
    // social bien formado, pero el campo es `unknown`), se recupera del
    // propio `external_chat_id` (`'<postId>:<commenterId>'`) antes de rendirse.
    const context = (chat.context ?? {}) as { platformPostId?: string | null }
    const postId = context.platformPostId || postIdFromChat(chat.external_chat_id) || undefined

    const res = await provider.createComment({
        username: profile.upload_post_username,
        platform: platform as Platform,
        message: text,
        commentId,
        postId,
    })
    if (!res.id) {
        // El provider normaliza `res?.id ?? res?.result?.comment_id ?? ''` —
        // un '' aquí no es "no hubo id", es "el proveedor no lo devolvió".
        // Guardarlo como `external_message_id` chocaría con
        // `uq_agent_messages_external` en la SEGUNDA respuesta pública de este
        // chat (dos filas con external_message_id='') y ese segundo mensaje
        // se quedaría `approved` para siempre, en silencio.
        throw new Error(
            'Upload-Post no devolvió el id del comentario creado' +
                ' — la respuesta pública puede haberse publicado; comprueba el post antes de reintentar',
        )
    }

    try {
        const outcome = await maybeSendCommentDm({
            chat,
            profileRow: profile,
            provider,
            commentId,
            commentTimestamp: lastInbound?.external_created_at ?? null,
        })
        if (outcome === 'failed') {
            console.error('[social] DM privado quedó `failed` (ver fila en social_comment_dms)', {
                avatarId: chat.avatar_id,
                chatId: chat.id,
                commentId,
            })
        }
    } catch (e) {
        // `maybeSendCommentDm` ya captura sus propios fallos de proveedor/BD
        // y nunca debería llegar hasta aquí — este catch es el cinturón: pase
        // lo que pase, la respuesta pública que YA salió no se marca fallida.
        console.error(
            '[social] DM privado: fallo inesperado no capturado por privateReply.ts',
            { avatarId: chat.avatar_id, chatId: chat.id, commentId },
            e,
        )
    }

    return { externalMessageId: res.id }
}

/** Bloque ORIGINAL de `sendAgentMessage` (líneas 47-64 antes de este cambio), sin tocar. */
async function deliverViaFanvue(chat: DeliverableChat, text: string): Promise<DeliveryResult> {
    const supabase = agentSupabase()
    const { data: avatar } = await supabase
        .from('avatars')
        .select('user_id, fanvue_creator_uuid')
        .eq('organization_id', chat.organization_id)
        .eq('id', chat.avatar_id)
        .single()
    if (!avatar?.user_id) throw new Error('Avatar has no owner')
    const connection = await loadConnection(avatar.user_id)
    if (!connection) throw new Error('Fanvue not connected')

    const client = makeFanvueClient(avatar.user_id)
    const res = await client.sendChatMessage(avatar.fanvue_creator_uuid ?? null, chat.external_chat_id, {
        text,
    })
    return { externalMessageId: res.messageUuid }
}
