/**
 * TikTok trending-sounds source via the Apify actor
 * `automation-lab/tiktok-trends-scraper` (pay-per-result). Called only by the
 * daily refresh cron — never on a page view — so cost stays at cents/day.
 */
const ACTOR = 'automation-lab~tiktok-trends-scraper'
const RUN_SYNC_URL = `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items`

export interface TrendingSoundInput {
    /** '' = worldwide; else ISO-2 like 'US','MX','ES'. */
    countryCode?: string
    period: 7 | 30 | 120
    maxResults: number
}

export interface NormalizedSound {
    rank: number
    soundId: string | null
    name: string
    author: string | null
    coverUrl: string | null
    playUrl: string | null
    linkUrl: string | null
    videoCount: number | null
    trend: string | null
    isOriginal: boolean | null
}

interface RawSound {
    rank?: number
    name?: string
    soundId?: string
    soundAuthor?: string
    soundCover?: string
    soundPlayUrl?: string
    linkedVideoUrl?: string
    publishedVideoCount?: number
    trend?: string
    isOriginal?: boolean
}

function str(v: unknown): string | null {
    return typeof v === 'string' && v.trim() ? v.trim() : null
}

/** Run the actor synchronously and return normalized rows. Throws on API/token errors. */
export async function fetchTrendingSounds(input: TrendingSoundInput): Promise<NormalizedSound[]> {
    const token = process.env.APIFY_TOKEN
    if (!token) throw new Error('APIFY_TOKEN is not configured')

    // The actor runs synchronously and TikTok scraping is slow. Bound it so a
    // stall fails cleanly instead of hanging the caller for Apify's 5-minute
    // default: `timeout` caps the actor run, the AbortController caps our fetch.
    const RUN_TIMEOUT_SECONDS = 110
    const controller = new AbortController()
    const abortTimer = setTimeout(() => controller.abort(), (RUN_TIMEOUT_SECONDS + 10) * 1000)
    let res: Response
    try {
        res = await fetch(
            `${RUN_SYNC_URL}?token=${encodeURIComponent(token)}&timeout=${RUN_TIMEOUT_SECONDS}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    trendType: 'sound',
                    countryCode: input.countryCode ?? '',
                    period: input.period,
                    maxResults: input.maxResults,
                }),
                signal: controller.signal,
            },
        )
    } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') {
            throw new Error('TikTok scrape timed out — try again in a moment')
        }
        throw e
    } finally {
        clearTimeout(abortTimer)
    }
    if (!res.ok) {
        const body = await res.text()
        throw new Error(`Apify actor failed (${res.status}): ${body.slice(0, 300)}`)
    }
    const items = (await res.json()) as RawSound[]
    if (!Array.isArray(items)) return []

    return items
        .map((raw, i): NormalizedSound => ({
            rank: typeof raw.rank === 'number' ? raw.rank : i + 1,
            soundId: str(raw.soundId),
            name: str(raw.name) ?? 'Untitled sound',
            author: str(raw.soundAuthor),
            coverUrl: str(raw.soundCover),
            playUrl: str(raw.soundPlayUrl),
            linkUrl: str(raw.linkedVideoUrl),
            videoCount: typeof raw.publishedVideoCount === 'number' ? raw.publishedVideoCount : null,
            trend: str(raw.trend),
            isOriginal: typeof raw.isOriginal === 'boolean' ? raw.isOriginal : null,
        }))
        .filter((s) => s.name)
}
