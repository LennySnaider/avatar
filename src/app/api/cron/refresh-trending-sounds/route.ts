/**
 * GET /api/cron/refresh-trending-sounds
 *
 * Daily refresh of the TikTok trending-sounds boards from Apify (see
 * `vercel.json`, once at 06:00 UTC). This is the ONLY place that spends Apify
 * credits — the chart UI reads the cached rows for free.
 *
 * To bound cost, only the default board (GLOBAL, 7d) is refreshed on the
 * schedule; other country/period boards refresh lazily when a user opens them
 * and hits "Refresh now" (or extend REFRESH_BOARDS here). Gated by
 * CRON_SECRET (Bearer), same as social-reconcile.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { refreshBoardInternal } from '@/services/TrendService'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const REFRESH_BOARDS: { countryCode: string; period: number }[] = [
    { countryCode: 'GLOBAL', period: 7 },
    { countryCode: 'US', period: 7 },
]

export async function GET(request: NextRequest) {
    const secret = process.env.CRON_SECRET
    const authHeader = request.headers.get('authorization')
    if (secret && authHeader !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const results: { board: string; count: number; error?: string }[] = []
    for (const board of REFRESH_BOARDS) {
        const res = await refreshBoardInternal(board.countryCode, board.period)
        results.push({
            board: `${board.countryCode}/${board.period}d`,
            count: res.data?.count ?? 0,
            ...(res.success ? {} : { error: res.error }),
        })
    }
    return NextResponse.json({ refreshed: results })
}
