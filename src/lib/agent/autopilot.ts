/**
 * Autopilot gate + flush. When a chat is in 'auto' mode and the persona's
 * autopilot is enabled, a fresh draft is risk-classified; only clearly-safe
 * messages get queued with a humanized delay. Everything else (payment,
 * complaint, sensitive, underage, or any classifier failure) escalates to a
 * human by flagging the chat `needs_attention` and leaving the draft.
 */
import { agentSupabase, type AvatarPersonaRow } from './db'
import { classifyInboundMessage } from './classifier'
import { sendAgentMessage } from './sendMessage'

export interface AutopilotConfig {
    enabled?: boolean
    activeHours?: { start?: string; end?: string; timezone?: string }
    delaySecondsMin?: number
    delaySecondsMax?: number
    dailyMessageLimit?: number
    escalate?: { payment?: boolean; complaint?: boolean; sensitive?: boolean; minors?: boolean }
}

export type AutopilotOutcome = 'scheduled' | 'escalated' | 'skipped'

function parseAutopilot(row: AvatarPersonaRow): AutopilotConfig {
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

async function escalate(chatId: string, reason: string): Promise<AutopilotOutcome> {
    const supabase = agentSupabase()
    await supabase
        .from('agent_chats')
        .update({ needs_attention: true, attention_reason: reason, updated_at: new Date().toISOString() })
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
    const { data: chat } = await supabase.from('agent_chats').select('*').eq('id', chatId).maybeSingle()
    if (!chat || chat.mode !== 'auto' || chat.is_creator) return 'skipped'

    const { data: persona } = await supabase
        .from('avatar_personas')
        .select('*')
        .eq('avatar_id', chat.avatar_id)
        .maybeSingle()
    if (!persona) return 'skipped'
    const cfg = parseAutopilot(persona as AvatarPersonaRow)
    if (!cfg.enabled) return 'skipped'

    // Classify the latest fan message (fail-closed).
    const { data: lastFan } = await supabase
        .from('agent_messages')
        .select('text')
        .eq('chat_id', chatId)
        .eq('direction', 'in')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    const risk = await classifyInboundMessage(lastFan?.text ?? '')
    if (!risk.autopilotSafe) {
        return escalate(chatId, `${risk.category}: ${risk.reason}`)
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
            return escalate(chatId, 'Daily autopilot limit reached — sending paused')
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
        .eq('id', draftMessageId)
        .eq('status', 'draft')
    return 'scheduled'
}

/** Send every autopilot message whose delay has elapsed. Called by the poll cron. */
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
        const res = await sendAgentMessage(row.id)
        if (res.success) sent++
        else failed++
    }
    return { sent, failed }
}
