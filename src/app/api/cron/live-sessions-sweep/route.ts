/**
 * GET /api/cron/live-sessions-sweep — cierra las llamadas en vivo cuyo
 * navegador desapareció sin colgar (sin heartbeat en 2 min) y refresca la
 * memoria de esos visitantes. Cada 5 min (vercel.json). Protegido por
 * CRON_SECRET, como el resto de crons.
 *
 * Barre TODAS las organizaciones a propósito (es un cron); cada update filtra
 * por la organization_id de su propia fila.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { orgSupabase } from '@/lib/org/orgTable'
import { updateFanMemoryFromChat } from '@/lib/agent/draftPipeline'
import { LIVE_LIMITS } from '@/lib/live/policy'
import { chargeLiveMinutes } from '@/lib/live/billing'
import { loadLiveSettings } from '@/lib/live/settings'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
    const secret = process.env.CRON_SECRET
    if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    const supabase = orgSupabase()
    const cutoff = new Date(Date.now() - LIVE_LIMITS.staleAfterMs).toISOString()
    const { data: stale, error } = await supabase
        .from('live_sessions')
        .select('id, organization_id, avatar_id, chat_id, turns, source, started_at, last_seen_at, last_billed_minute')
        .eq('status', 'active')
        .lt('last_seen_at', cutoff)
        .limit(100)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    let expired = 0
    const chats = new Set<string>()
    for (const s of stale ?? []) {
        const { data } = await supabase
            .from('live_sessions')
            .update({ status: 'expired', ended_at: new Date().toISOString(), end_reason: 'stale' })
            .eq('organization_id', s.organization_id)
            .eq('id', s.id)
            .eq('status', 'active')
            .select('id')
        if (data?.length) {
            expired++
            // Se cobra hasta el ÚLTIMO heartbeat, no hasta ahora: desde ahí
            // el navegador ya no estaba.
            const settings = await loadLiveSettings(s.avatar_id).catch(() => null)
            await chargeLiveMinutes(s, Date.parse(s.last_seen_at), settings?.maxSessionSeconds ?? 3600)
            if (s.chat_id && s.turns > 0) chats.add(s.chat_id)
        }
    }
    for (const chatId of Array.from(chats).slice(0, 20)) await updateFanMemoryFromChat(chatId)
    return NextResponse.json({ expired, memoriesRefreshed: Math.min(chats.size, 20) })
}
