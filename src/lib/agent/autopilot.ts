/**
 * Autopilot gate + flush. When a chat is in 'auto' mode and the persona's
 * autopilot is enabled, a fresh draft is risk-classified; only clearly-safe
 * messages get queued with a humanized delay. Everything else (payment,
 * complaint, sensitive, underage, or any classifier failure) escalates to a
 * human by flagging the chat `needs_attention` and leaving the draft.
 *
 * F4.2 Tarea 4 — EXENTO de `orgTable`: lo disparan el webhook y el cron, sin
 * sesión. El cliente sigue crudo, pero el resto de consultas cuelgan de la org
 * de la fila ya resuelta (`chat.organization_id`), no de ids sueltos.
 */
import { agentSupabase, type AvatarPersonaRow } from './db'
import { classifyInboundMessage } from './classifier'
import { sendAgentMessage } from './sendMessage'
import { resolveDeliveryChannel } from './channelRouting'
import { hasPaidMediaOffer } from '@/lib/telegram/offerGate'

export interface AutopilotConfig {
    enabled?: boolean
    activeHours?: { start?: string; end?: string; timezone?: string }
    delaySecondsMin?: number
    delaySecondsMax?: number
    dailyMessageLimit?: number
    escalate?: { payment?: boolean; complaint?: boolean; sensitive?: boolean; minors?: boolean }
    /** Telegram: si un borrador con oferta de contenido de pago puede salir
     *  solo. false/undefined = escala a humano (ofrecer es vender). */
    allowPaidMediaOffers?: boolean
    /** Telegram: tope de Stars que la IA puede ofrecer por sí sola. */
    maxOfferStars?: number
    /** Telegram: horas mínimas entre dos ofertas al mismo fan. Default 6. */
    offerCooldownHours?: number
}

export type AutopilotOutcome = 'scheduled' | 'escalated' | 'skipped'

/** Exportada para el motor de oferta (`@/lib/telegram/offerEngine`), que lee
 *  los mismos ajustes (`maxOfferStars`, `offerCooldownHours`) ANTES de
 *  adjuntar nada. Una segunda lectura del JSON en otro fichero se
 *  desincronizaría el día que esta forma cambie. */
export function parseAutopilot(row: AvatarPersonaRow): AutopilotConfig {
    return (row.autopilot ?? {}) as AutopilotConfig
}

/** "HH:MM" in a timezone → is `now` within [start,end]? Lenient: bad config = always active. */
function withinActiveHours(cfg: AutopilotConfig, now: Date): boolean {
    const start = cfg.activeHours?.start
    const end = cfg.activeHours?.end
    if (!start || !end) return true
    const tz = cfg.activeHours?.timezone || 'UTC'
    let hhmm: string
    try {
        hhmm = new Intl.DateTimeFormat('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: tz,
        }).format(now)
    } catch {
        return true
    }
    // Same-day window; if start>end treat as overnight window.
    if (start <= end) return hhmm >= start && hhmm <= end
    return hhmm >= start || hhmm <= end
}

function randDelaySeconds(cfg: AutopilotConfig, seed: number): number {
    const min = Math.max(0, cfg.delaySecondsMin ?? 30)
    const max = Math.max(min, cfg.delaySecondsMax ?? 180)
    // Deterministic pseudo-random from seed (Math.random is unavailable in some
    // contexts and we want reproducibility in tests): mix the seed.
    const frac = ((Math.sin(seed) + 1) / 2)
    return Math.round(min + frac * (max - min))
}

async function escalate(organizationId: string, chatId: string, reason: string): Promise<AutopilotOutcome> {
    const supabase = agentSupabase()
    await supabase
        .from('agent_chats')
        .update({ needs_attention: true, attention_reason: reason, updated_at: new Date().toISOString() })
        .eq('organization_id', organizationId)
        .eq('id', chatId)
    return 'escalated'
}

/**
 * Decide whether a just-generated draft can auto-send. Called after a draft is
 * created for an 'auto' chat. Does NOT send now — it approves + queues with
 * send_after; the flush cron does the actual send.
 */
export async function maybeAutopilotSend(chatId: string, draftMessageId: string): Promise<AutopilotOutcome> {
    const supabase = agentSupabase()
    // El chat se busca por id sin filtro de org porque ESTE id lo acaba de
    // producir nuestro propio pipeline (draft recién creado); es la fila que
    // RESUELVE la org, no una que haya que autorizar. De aquí en adelante todo
    // cuelga de `chat.organization_id`.
    const { data: chat } = await supabase.from('agent_chats').select('*').eq('id', chatId).maybeSingle()
    if (!chat || chat.mode !== 'auto' || chat.is_creator) return 'skipped'

    const { data: persona } = await supabase
        .from('avatar_personas')
        .select('*')
        .eq('organization_id', chat.organization_id)
        .eq('avatar_id', chat.avatar_id)
        .maybeSingle()
    if (!persona) return 'skipped'
    const cfg = parseAutopilot(persona as AvatarPersonaRow)
    if (!cfg.enabled) return 'skipped'

    // Spec A4: un borrador con oferta de contenido de pago sólo sale solo si
    // el creador lo permitió expresamente. Ofrecer es vender.
    //
    // GATEADO A TELEGRAM a propósito: las ofertas adjuntas (`offerEngine`)
    // sólo existen en ese canal, y sólo `sendAgentMessage` las cobra cuando
    // el chat es de Telegram. Para Fanvue esta lectura no podía encontrar
    // nada, pero sí podía FALLAR — y entonces escalaba un chat de Fanvue con
    // un motivo de Telegram ("Could not verify paid offer"), una consulta por
    // borrador que a ese canal no le sirve de nada.
    if (resolveDeliveryChannel(chat.platform) === 'telegram') {
        // El `error` NO se descarta, y es la diferencia entre fallar cerrado y
        // fallar abierto: sin mirarlo, un fallo transitorio de Supabase deja
        // `draftRow` en null, `hasPaidMediaOffer(undefined)` responde `false`,
        // la escalada no ocurre y un borrador que SÍ lleva oferta sale solo
        // sin permiso del creador. Como la entrega ya cobra la oferta
        // adjunta, eso sería dinero cobrado sin autorización por un error de
        // red. Si no se puede COMPROBAR que el borrador está limpio, se
        // escala.
        const { data: draftRow, error: draftError } = await supabase
            .from('agent_messages')
            .select('media')
            .eq('organization_id', chat.organization_id)
            .eq('id', draftMessageId)
            .maybeSingle()
        if (draftError) {
            console.error(
                '[agent] autopilot: no se pudo leer el borrador para comprobar la oferta',
                { chatId, draftMessageId },
                draftError,
            )
            return escalate(chat.organization_id, chatId, 'Could not verify paid offer — needs review')
        }
        if (hasPaidMediaOffer(draftRow?.media) && !cfg.allowPaidMediaOffers) {
            return escalate(chat.organization_id, chatId, 'Paid media offer needs approval')
        }
    }

    // Classify the latest fan message (fail-closed).
    const { data: lastFan } = await supabase
        .from('agent_messages')
        .select('text')
        .eq('organization_id', chat.organization_id)
        .eq('chat_id', chatId)
        .eq('direction', 'in')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    const risk = await classifyInboundMessage(lastFan?.text ?? '')
    if (!risk.autopilotSafe) {
        return escalate(chat.organization_id, chatId, `${risk.category}: ${risk.reason}`)
    }

    // Active hours.
    const now = new Date()
    if (!withinActiveHours(cfg, now)) return 'skipped'

    // Daily limit (messages actually sent today for this avatar).
    if (cfg.dailyMessageLimit && cfg.dailyMessageLimit > 0) {
        const dayStart = now.toISOString().slice(0, 10) + 'T00:00:00.000Z'
        const { count } = await supabase
            .from('agent_messages')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', chat.organization_id)
            .eq('status', 'sent')
            .eq('approved_by', 'autopilot')
            .gte('sent_at', dayStart)
        if ((count ?? 0) >= cfg.dailyMessageLimit) {
            return escalate(
                chat.organization_id,
                chatId,
                'Daily autopilot limit reached — sending paused',
            )
        }
    }

    // Approve + queue with a humanized delay.
    const delaySec = randDelaySeconds(cfg, new Date(chat.created_at).getTime() + chatId.length)
    const sendAfter = new Date(now.getTime() + delaySec * 1000).toISOString()
    await supabase
        .from('agent_messages')
        .update({
            status: 'approved',
            approved_by: 'autopilot',
            send_after: sendAfter,
            updated_at: now.toISOString(),
        })
        .eq('organization_id', chat.organization_id)
        .eq('id', draftMessageId)
        .eq('status', 'draft')
    return 'scheduled'
}

/**
 * Send every autopilot message whose delay has elapsed. La llama el cron por
 * minuto (`agent-autopilot-flush`), ÚNICO dueño de la cola.
 *
 * Deliberadamente SIN filtro de org: es un barrido de cron para TODAS las orgs
 * (no hay sesión de la que sacar una). Cada envío vuelve a resolver su propia
 * org dentro de `sendAgentMessage`, que sí acota por la fila del mensaje.
 *
 * Que hoy la llame un solo cron NO es la garantía de que un mensaje no salga
 * dos veces — un cron puede solaparse consigo mismo si una corrida se alarga.
 * La garantía es el RECLAMO ATÓMICO de abajo.
 */
export async function flushDueAutopilotMessages(): Promise<{ sent: number; failed: number }> {
    const supabase = agentSupabase()
    const nowIso = new Date().toISOString()
    const { data: due } = await supabase
        .from('agent_messages')
        .select('id')
        .eq('status', 'approved')
        .eq('approved_by', 'autopilot')
        .not('send_after', 'is', null)
        .lte('send_after', nowIso)
        .limit(50)
    let sent = 0
    let failed = 0
    for (const row of due ?? []) {
        // RECLAMO ATÓMICO. Sin esto, dos barridos concurrentes (o uno que
        // muere entre el envío y el update a `sent`) envían el mismo mensaje
        // dos veces — y en Telegram, la misma media de pago dos veces.
        // Postgres serializa el UPDATE ... WHERE por fila: sólo un barrido
        // consigue la fila; el otro ve 0 filas y sigue. `send_after` a null
        // es el reclamo (el select de arriba exige que no sea null) y
        // `sendAgentMessage` no lo mira, así que no cambia nada más.
        const { data: claimed, error: claimError } = await supabase
            .from('agent_messages')
            .update({ send_after: null, updated_at: nowIso })
            .eq('id', row.id)
            .eq('status', 'approved')
            .not('send_after', 'is', null)
            .select('id')
        if (claimError) {
            console.error('[agent] autopilot flush: no se pudo reclamar el mensaje', { messageId: row.id }, claimError)
            failed++
            continue
        }
        if (!claimed || claimed.length === 0) continue // otro barrido ya lo tomó
        const res = await sendAgentMessage(row.id)
        if (res.success) sent++
        else failed++
    }
    return { sent, failed }
}
