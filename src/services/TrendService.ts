'use server'

/**
 * Trending-sounds chart. Reads served from the DB cache (free); the paid Apify
 * refresh runs once a day from the cron. Global reference data — not
 * tenant-scoped — but still requires an authenticated session.
 */
import { auth } from '@/auth'
import { fetchTrendingSounds } from '@/lib/trends/apifyTikTok'
import { trendsSupabase, type TrendingSoundRow } from '@/lib/trends/db'
import type { TrendingSoundDTO } from '@/lib/trends/constants'

export interface TrendResult<T> {
    success: boolean
    data?: T
    error?: string
}

const REFRESH_LIMIT = 50

const fail = (e: unknown): { success: false; error: string } => ({
    success: false,
    error: e instanceof Error ? e.message : String(e),
})

async function requireSession() {
    const session = await auth()
    if (!session?.user?.id) throw new Error('Not authenticated')
}

function toDTO(row: TrendingSoundRow): TrendingSoundDTO {
    return {
        id: row.id,
        rank: row.rank,
        soundId: row.sound_id,
        name: row.name,
        author: row.author,
        coverUrl: row.cover_url,
        playUrl: row.play_url,
        linkUrl: row.link_url,
        videoCount: row.video_count,
        trend: row.trend,
        isOriginal: row.is_original,
    }
}

export async function listTrendingSounds(params: {
    countryCode?: string
    period?: number
}): Promise<TrendResult<{ sounds: TrendingSoundDTO[]; fetchedAt: string | null }>> {
    try {
        await requireSession()
        const countryCode = params.countryCode || 'GLOBAL'
        const period = params.period ?? 7
        const supabase = trendsSupabase()
        const { data, error } = await supabase
            .from('trending_sounds')
            .select('*')
            .eq('source', 'tiktok')
            .eq('country_code', countryCode)
            .eq('period', period)
            .order('rank', { ascending: true })
            .limit(100)
        if (error) throw new Error(error.message)
        const rows = data ?? []
        return {
            success: true,
            data: {
                sounds: rows.map(toDTO),
                fetchedAt: rows[0]?.fetched_at ?? null,
            },
        }
    } catch (e) {
        return fail(e)
    }
}

/**
 * Refresh ONE board from Apify (paid). Replaces that board's rows atomically:
 * upsert the fresh set, then drop any stale row from the same board. Callable
 * from the UI ("Refresh now") and the cron.
 */
export async function refreshTrendingBoard(params: {
    countryCode?: string
    period?: number
}): Promise<TrendResult<{ count: number }>> {
    try {
        await requireSession()
        return refreshBoardInternal(params.countryCode || 'GLOBAL', params.period ?? 7)
    } catch (e) {
        return fail(e)
    }
}

/** Session-less core (used by the cron). */
export async function refreshBoardInternal(
    countryCode: string,
    period: number,
): Promise<TrendResult<{ count: number }>> {
    try {
        const sounds = await fetchTrendingSounds({
            countryCode: countryCode === 'GLOBAL' ? '' : countryCode,
            period: (period as 7 | 30 | 120) ?? 7,
            maxResults: REFRESH_LIMIT,
        })
        const supabase = trendsSupabase()
        const fetchedAt = new Date().toISOString()

        // Rows without a soundId can't be deduped by the unique key — clear the
        // whole board first so a refresh never leaves orphans, then insert.
        await supabase
            .from('trending_sounds')
            .delete()
            .eq('source', 'tiktok')
            .eq('country_code', countryCode)
            .eq('period', period)

        if (sounds.length === 0) return { success: true, data: { count: 0 } }

        const rows = sounds.map((s) => ({
            source: 'tiktok',
            country_code: countryCode,
            period,
            rank: s.rank,
            sound_id: s.soundId,
            name: s.name,
            author: s.author,
            cover_url: s.coverUrl,
            play_url: s.playUrl,
            link_url: s.linkUrl,
            video_count: s.videoCount,
            trend: s.trend,
            is_original: s.isOriginal,
            fetched_at: fetchedAt,
        }))
        const { error } = await supabase.from('trending_sounds').insert(rows)
        if (error) throw new Error(error.message)
        return { success: true, data: { count: rows.length } }
    } catch (e) {
        return fail(e)
    }
}
