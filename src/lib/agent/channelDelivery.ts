/**
 * Entrega de un TEXTO ya aprobado por el canal del chat.
 *
 * Antes esto vivía dentro de `sendAgentMessage` cableado a Fanvue. Ahora
 * `sendAgentMessage` decide estado, contadores y memoria, y ESTE fichero
 * decide por dónde sale el mensaje. La rama de Fanvue es el bloque original
 * movido tal cual: mismo cliente, mismas llamadas, mismo resultado.
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
import { loadTelegramBotToken } from '@/lib/telegram/settings'
import { sendMessage as telegramSendMessage } from '@/lib/telegram/client'

export interface DeliverableChat {
    id: string
    organization_id: string
    avatar_id: string
    platform: string
    external_chat_id: string
}

export interface DeliveryResult {
    externalMessageId: string
}

export async function deliverAgentText(chat: DeliverableChat, text: string): Promise<DeliveryResult> {
    const channel = resolveDeliveryChannel(chat.platform)
    if (channel === 'telegram') return deliverViaTelegram(chat, text)
    return deliverViaFanvue(chat, text)
}

async function deliverViaTelegram(chat: DeliverableChat, text: string): Promise<DeliveryResult> {
    const token = await loadTelegramBotToken(chat.avatar_id)
    if (!token) throw new Error('Telegram bot not connected')
    const sent = await telegramSendMessage(token, {
        chat_id: chat.external_chat_id,
        text,
    })
    return { externalMessageId: String(sent.message_id) }
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
