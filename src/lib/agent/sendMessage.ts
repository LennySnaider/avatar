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
import { findFreeMediaOffer, findPaidMediaOffer } from '@/lib/telegram/offerGate'
import { deliverPaidMedia } from '@/lib/telegram/paidMedia'
import { deliverFreeMedia } from '@/lib/telegram/freeMedia'

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

    // Los dos returns de aquí abajo marcan `failed` antes de salir: el reclamo
    // atómico del flush ya no reintenta, así que un `approved` que nunca va a
    // poder salir tiene que quedar visible y no mudo en la cola.
    const text = (msg.text ?? '').trim()
    if (!text) {
        console.error('[agent] send failed', { messageId }, 'Empty message')
        await supabase
            .from('agent_messages')
            .update({ status: 'failed', error_message: 'Empty message', updated_at: new Date().toISOString() })
            .eq('organization_id', msg.organization_id)
            .eq('id', messageId)
            .eq('status', 'approved')
        return { success: false, error: 'Empty message' }
    }

    const { data: chat } = await supabase
        .from('agent_chats')
        .select('*')
        .eq('organization_id', msg.organization_id)
        .eq('id', msg.chat_id)
        .single()
    if (!chat) {
        console.error('[agent] send failed', { messageId }, 'Chat not found')
        await supabase
            .from('agent_messages')
            .update({ status: 'failed', error_message: 'Chat not found', updated_at: new Date().toISOString() })
            .eq('organization_id', msg.organization_id)
            .eq('id', messageId)
            .eq('status', 'approved')
        return { success: false, error: 'Chat not found' }
    }

    // "Avatar has no owner" / "Fanvue not connected" ya no salen con { success: false }
    // en silencio: lanzan dentro del try y el catch los deja `failed` con el motivo.
    try {
        const res = await deliverAgentText(chat, text)
        // `.eq('status', 'approved')` es defensa en profundidad: quien reclama
        // la fila es el flush (`flushDueAutopilotMessages`), pero si por
        // cualquier vía este mensaje llegara aquí dos veces, la segunda no
        // pisa el `sent` de la primera — ni su `external_message_id`, que es
        // el del envío que de verdad ocurrió.
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
            .eq('status', 'approved')
        // Un envío del autopilot LIMPIA la bandera de atención. Visto en vivo:
        // el `/start` que el clasificador escalaba dejaba `needs_attention` con
        // el motivo pegado ("Autopilot paused") y nadie lo bajaba nunca —
        // aunque el autopilot siguiera contestando solo, el inbox mostraba a
        // todos los fans nuevos como si esperasen a un humano. La bandera dice
        // "aquí hace falta una persona"; si el autopilot acaba de responder,
        // ya no hace falta. Un envío aprobado a mano NO la toca: ahí el humano
        // ya estaba dentro y es él quien decide cuándo cerrar el caso.
        const sentByAutopilot = msg.approved_by === 'autopilot'
        await supabase
            .from('agent_chats')
            .update({
                last_message_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                ...(sentByAutopilot ? { needs_attention: false, attention_reason: null } : {}),
            })
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
        //
        // EL PRECIO ES EL DEL CATÁLOGO EN EL MOMENTO DE ENTREGAR, no el que
        // llevaba el borrador: por eso NO se pasa `stars`, que en
        // `deliverPaidMedia` es un override puntual. Un borrador en modo
        // `draft` puede esperar días a que un humano lo apruebe, y si el
        // creador subió o bajó el precio entretanto, congelarlo aquí cobraría
        // el viejo. Cuando los dos no coinciden se deja rastro: el borrador
        // enseñó una cifra y Telegram cobró otra, y eso el creador tiene que
        // poder verlo.
        //
        // GRATIS Y DE PAGO SON EXCLUYENTES por construcción: `offerEngine`
        // adjunta como mucho una oferta por borrador. Si aun así llegaran las
        // dos, se entrega SÓLO la gratis y se avisa — regalar de más es un
        // error recuperable; cobrar de más, no.
        const isTelegram = resolveDeliveryChannel(chat.platform) === 'telegram'
        const freeOffer = findFreeMediaOffer(msg.media)
        const offer = findPaidMediaOffer(msg.media)
        if (freeOffer && offer) {
            console.warn('[agent] el borrador llevaba oferta gratis Y de pago; sólo se entrega la gratis', {
                messageId,
                freeItemId: freeOffer.itemId,
                paidItemId: offer.itemId,
            })
        }
        // Teaser gratis (fotos-gratis Tarea 4): sin cobro, sin venta. Mismo
        // criterio de error que la rama de pago — el texto ya salió y el
        // mensaje ya es `sent`, así que un fallo aquí se loguea y no marca
        // `failed`: el fan sí recibió la respuesta.
        if (freeOffer && isTelegram) {
            try {
                await deliverFreeMedia({
                    chat: {
                        id: chat.id,
                        organizationId: chat.organization_id,
                        avatarId: chat.avatar_id,
                        externalChatId: chat.external_chat_id,
                    },
                    itemId: freeOffer.itemId,
                    caption: freeOffer.caption || undefined,
                    source: 'agent',
                    // Misma atribución que la rama de pago: si el borrador lo
                    // aprobó una persona, el teaser es suyo, no del autopilot.
                    approvedBy: msg.approved_by,
                })
            } catch (e) {
                console.error('[agent] teaser gratis no entregado', { messageId, itemId: freeOffer.itemId }, e)
            }
        }
        if (offer && !freeOffer && isTelegram) {
            try {
                const delivered = await deliverPaidMedia({
                    chat: {
                        id: chat.id,
                        organizationId: chat.organization_id,
                        avatarId: chat.avatar_id,
                        externalChatId: chat.external_chat_id,
                    },
                    itemId: offer.itemId,
                    caption: offer.caption || undefined,
                    source: 'agent',
                    approvedBy: msg.approved_by ?? null,
                })
                if (delivered.stars !== offer.stars) {
                    console.warn('[agent] precio de catálogo distinto al del borrador', {
                        messageId,
                        itemId: offer.itemId,
                        draft: offer.stars,
                        charged: delivered.stars,
                    })
                }
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
        // Misma guarda que en el camino de éxito, y por un motivo más fuerte:
        // sin ella, un envío que falló aquí podría marcar `failed` un mensaje
        // que OTRO barrido ya dejó `sent` — borrando del registro un mensaje
        // que el fan sí recibió.
        await supabase
            .from('agent_messages')
            .update({ status: 'failed', error_message: message, updated_at: new Date().toISOString() })
            .eq('organization_id', msg.organization_id)
            .eq('id', messageId)
            .eq('status', 'approved')
        return { success: false, error: message }
    }
}
