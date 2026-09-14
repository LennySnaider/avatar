/**
 * Core "send an approved agent message por el canal del chat (Fanvue o
 * Telegram)" — shared by the manual approve flow
 * (AgentInboxService.approveAndSend) and the autopilot flush. Handles the
 * status transitions, counter bump and fan-memory refresh; POR DÓNDE sale el
 * texto lo decide `channelDelivery.ts` a partir de `chat.platform`.
 *
 * F4.2 Tarea 4 — EXENTO de `orgTable`: el flush de autopilot lo llama desde el
 * cron, sin sesión. El mensaje (id ya aprobado por nuestro propio flujo) es la
 * fila que RESUELVE la org; chat, avatar y las transiciones de estado filtran
 * a partir de ahí por `organization_id` en vez de navegar por ids sueltos.
 */
import { agentSupabase } from './db'
import { updateFanMemoryFromChat } from './draftPipeline'
import { deliverAgentText } from './channelDelivery'
import { resolveDeliveryChannel } from './channelRouting'
import { findPaidMediaOffer } from '@/lib/telegram/offerGate'
import { deliverPaidMedia } from '@/lib/telegram/paidMedia'

export interface SendAgentMessageResult {
    success: boolean
    externalMessageId?: string
    error?: string
}

function currentPeriod(): string {
    // 'YYYY-MM' from an ISO string (no Date.now/new Date locale needs).
    return new Date().toISOString().slice(0, 7)
}

/**
 * Send an already-approved agent_messages row. Resolves the sending account
 * from the chat's avatar. On success: status 'sent' + external id + counters;
 * on failure: status 'failed' + error_message. Idempotent-ish: only acts on
 * rows still in 'approved'.
 */
export async function sendAgentMessage(messageId: string): Promise<SendAgentMessageResult> {
    const supabase = agentSupabase()
    const { data: msg } = await supabase
        .from('agent_messages')
        .select('*')
        .eq('id', messageId)
        .maybeSingle()
    if (!msg) return { success: false, error: 'Message not found' }
    if (msg.status !== 'approved') return { success: false, error: `Message is ${msg.status}, not approved` }

    const text = (msg.text ?? '').trim()
    if (!text) return { success: false, error: 'Empty message' }

    const { data: chat } = await supabase
        .from('agent_chats')
        .select('*')
        .eq('organization_id', msg.organization_id)
        .eq('id', msg.chat_id)
        .single()
    if (!chat) return { success: false, error: 'Chat not found' }

    // "Avatar has no owner" / "Fanvue not connected" ya no salen con { success: false }
    // en silencio: lanzan dentro del try y el catch los deja `failed` con el motivo.
    try {
        const res = await deliverAgentText(chat, text)
        await supabase
            .from('agent_messages')
            .update({
                status: 'sent',
                external_message_id: res.externalMessageId,
                sent_at: new Date().toISOString(),
                send_after: null,
                updated_at: new Date().toISOString(),
            })
            .eq('organization_id', msg.organization_id)
            .eq('id', messageId)
        await supabase
            .from('agent_chats')
            .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('organization_id', chat.organization_id)
            .eq('id', chat.id)
        // Oferta adjunta (offerEngine, Telegram): se entrega DESPUÉS del texto
        // y con `source: 'agent'`, que es lo que `deliverPaidMedia` convierte
        // en `sold_by = 'ai'` (comisión del 20%). Si falla, el texto ya salió
        // y el mensaje ya es `sent`: se loguea y no se marca `failed`, porque
        // el fan sí recibió la respuesta. La venta no se crea de más: la crea
        // `deliverPaidMedia` al ofrecer (PASO 2, antes de tocar Telegram), así
        // que un fallo ANTES de esa inserción no descuadra nada; un fallo
        // DESPUÉS deja la fila en `offered`, que el barrido de reconciliación
        // (deuda anotada) recogerá.
        const offer = findPaidMediaOffer(msg.media)
        if (offer && resolveDeliveryChannel(chat.platform) === 'telegram') {
            try {
                await deliverPaidMedia({
                    chat: {
                        id: chat.id,
                        organizationId: chat.organization_id,
                        avatarId: chat.avatar_id,
                        externalChatId: chat.external_chat_id,
                    },
                    itemId: offer.itemId,
                    stars: offer.stars,
                    caption: offer.caption || undefined,
                    source: 'agent',
                    approvedBy: msg.approved_by ?? null,
                })
            } catch (e) {
                console.error('[agent] oferta adjunta no entregada', { messageId, itemId: offer.itemId }, e)
            }
        }
        // Counters (best-effort).
        const period = currentPeriod()
        await supabase.rpc('increment_agent_counter', {
            p_org: chat.organization_id,
            p_avatar: chat.avatar_id,
            p_period: period,
            p_counter: 'messages_sent',
        })
        if (msg.approved_by === 'autopilot') {
            await supabase.rpc('increment_agent_counter', {
                p_org: chat.organization_id,
                p_avatar: chat.avatar_id,
                p_period: period,
                p_counter: 'auto_sent',
            })
        }
        void updateFanMemoryFromChat(chat.id)
        return { success: true, externalMessageId: res.externalMessageId }
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        console.error('[agent] send failed', { messageId, chatId: chat.id, platform: chat.platform }, message)
        await supabase
            .from('agent_messages')
            .update({ status: 'failed', error_message: message, updated_at: new Date().toISOString() })
            .eq('organization_id', msg.organization_id)
            .eq('id', messageId)
        return { success: false, error: message }
    }
}
