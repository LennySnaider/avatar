/**
 * Shared helpers for the Instagram Reel extraction routes.
 *
 * Both /api/instagram/extract (parses the public Reel HTML) and
 * /api/instagram/proxy (streams CDN bytes same-origin so the browser <canvas>
 * isn't tainted) need the same two guards:
 *   1. URL validation — only accept real instagram.com Reel/post links.
 *   2. Host allowlist — the proxy must NEVER fetch an arbitrary URL (SSRF), only
 *      Instagram/Facebook media CDNs.
 * Keeping them here avoids drift between the two routes.
 */

// A realistic desktop UA. Instagram serves the og: meta tags to "browser-like"
// clients; a bare fetch UA often gets a stripped login wall with no media.
export const BROWSER_UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// Hosts the proxy is allowed to fetch from. Instagram serves Reel pages from
// instagram.com and the media itself from these CDNs.
const ALLOWED_HOST_SUFFIXES = [
    'instagram.com',
    'cdninstagram.com',
    'fbcdn.net',
]

/** True when `host` ends with one of the allowlisted suffixes (sub-domains ok). */
export function isAllowedMediaHost(host: string): boolean {
    const h = host.toLowerCase()
    return ALLOWED_HOST_SUFFIXES.some(
        (suffix) => h === suffix || h.endsWith(`.${suffix}`),
    )
}

/**
 * Validate + normalize a user-supplied Instagram Reel/post URL. Returns the
 * canonical URL string, or null if it isn't a recognizable Instagram link.
 * Accepts reel, reels, p (and tv) paths with or without query/trailing slash.
 */
export function normalizeInstagramUrl(raw: string): string | null {
    let parsed: URL
    try {
        parsed = new URL(raw.trim())
    } catch {
        return null
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null

    const host = parsed.hostname.toLowerCase()
    const isInstagram =
        host === 'instagram.com' ||
        host === 'www.instagram.com' ||
        host.endsWith('.instagram.com')
    if (!isInstagram) return null

    // Path must point at a shareable media object.
    if (!/^\/(reel|reels|p|tv)\/[^/]+/i.test(parsed.pathname)) return null

    // Strip tracking params; keep only the canonical path on https.
    return `https://www.instagram.com${parsed.pathname.replace(/\/+$/, '')}/`
}

export interface ReelMeta {
    videoUrl?: string
    thumbnailUrl?: string
    caption?: string
}

/** Pull an og:/twitter: meta tag's content out of raw HTML. */
function readMeta(html: string, property: string): string | undefined {
    // Match <meta property="og:video" content="..."> in either attribute order.
    const patterns = [
        new RegExp(
            `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
            'i',
        ),
        new RegExp(
            `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
            'i',
        ),
    ]
    for (const re of patterns) {
        const m = html.match(re)
        if (m?.[1]) return decodeHtmlEntities(m[1])
    }
    return undefined
}

function decodeHtmlEntities(s: string): string {
    return s
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
}

/**
 * Extract the Reel's video URL, cover image and caption from the public page
 * HTML. Instagram almost always exposes og:image (the cover frame); og:video is
 * present for many public Reels but stripped when the post is gated — callers
 * must handle a missing videoUrl by falling back to file upload.
 */
export function parseReelMeta(html: string): ReelMeta {
    const videoUrl =
        readMeta(html, 'og:video:secure_url') ||
        readMeta(html, 'og:video:url') ||
        readMeta(html, 'og:video')
    const thumbnailUrl =
        readMeta(html, 'og:image') || readMeta(html, 'twitter:image')
    const caption =
        readMeta(html, 'og:title') || readMeta(html, 'og:description')

    const meta: ReelMeta = {}
    if (videoUrl && isAllowedMediaHost(safeHost(videoUrl))) meta.videoUrl = videoUrl
    if (thumbnailUrl && isAllowedMediaHost(safeHost(thumbnailUrl)))
        meta.thumbnailUrl = thumbnailUrl
    if (caption) meta.caption = caption.slice(0, 500)
    return meta
}

function safeHost(url: string): string {
    try {
        return new URL(url).hostname
    } catch {
        return ''
    }
}

// =============================================================================
// MEDIA RESOLVER — our own Instagram downloader (no third-party service)
// =============================================================================
//
// Snapinsta-style downloaders don't read og: tags — they hit Instagram's own
// internal endpoints to get the real CDN video URL. We do the same, trying
// several "doors" in order and stopping at the first that returns media:
//
//   T1  shortcode → media_id → /api/v1/media/{id}/info/  (x-ig-app-id header)
//   T2  GraphQL query by shortcode (doc_id)
//   T3  /reel/{shortcode}/embed/captioned/  HTML parse
//   T4  og:video / og:image  (the original lightweight path, last resort)
//
// The real-world limiter is IP reputation: these endpoints answer happily from
// residential IPs but Instagram blocks datacenter IPs (Vercel) often. Set
// INSTAGRAM_PROXY_URL to a residential "web unlocker" (ScraperAPI / ScrapingBee
// / BrightData, URL mode) to route through a clean IP — see igFetch below. When
// every door fails the caller still falls back to manual file upload.

// Public Instagram web app id — pairs with a browser UA to unlock the JSON APIs.
const IG_APP_ID = '936619743392459'
// Persisted GraphQL query id for "load post by shortcode". Instagram rotates
// these; T2 is best-effort and the chain tolerates its failure.
const GRAPHQL_DOC_ID = '10015901848480474'

/**
 * Proxy-aware fetch. If INSTAGRAM_PROXY_URL is set it routes the request through
 * a URL-template proxy — either `https://unlocker/?url={url}` (placeholder) or a
 * prefix the target is appended to. This deliberately supports the URL-mode of
 * residential unlocker services (which is what actually bypasses IG's datacenter
 * blocks) instead of a CONNECT agent, keeping it dependency-free.
 */
export function igFetch(targetUrl: string, init?: RequestInit): Promise<Response> {
    const tmpl = process.env.INSTAGRAM_PROXY_URL?.trim()
    if (!tmpl) return fetch(targetUrl, init)
    const proxied = tmpl.includes('{url}')
        ? tmpl.replace('{url}', encodeURIComponent(targetUrl))
        : `${tmpl}${encodeURIComponent(targetUrl)}`
    return fetch(proxied, init)
}

/** Pull the shortcode out of a /reel|reels|p|tv/<shortcode>/ URL. */
export function extractShortcode(url: string): string | null {
    const m = url.match(/\/(?:reel|reels|p|tv)\/([^/?#]+)/i)
    return m ? m[1] : null
}

// Instagram shortcodes are base64url over this exact alphabet; decoding gives
// the numeric media id used by the media-info API. Ids exceed 2^53 so we need
// BigInt (constructor form — target is ES2017, no bigint literals).
const SHORTCODE_ALPHABET =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

export function shortcodeToMediaId(shortcode: string): string | null {
    let id = BigInt(0)
    const base = BigInt(64)
    for (const ch of shortcode) {
        const idx = SHORTCODE_ALPHABET.indexOf(ch)
        if (idx === -1) return null
        id = id * base + BigInt(idx)
    }
    return id > BigInt(0) ? id.toString() : null
}

export interface ResolveResult extends ReelMeta {
    /** Which door answered — handy for debugging/telemetry. */
    technique?: string
}

// --- Minimal shapes of the IG JSON we read (avoids `any`) -------------------
interface IgMediaItem {
    video_versions?: { url?: string }[]
    image_versions2?: { candidates?: { url?: string }[] }
    caption?: { text?: string } | null
    carousel_media?: IgMediaItem[]
}
interface IgMediaInfo {
    items?: IgMediaItem[]
}
interface IgShortcodeMedia {
    video_url?: string
    display_url?: string
    thumbnail_src?: string
    edge_media_to_caption?: { edges?: { node?: { text?: string } }[] }
}
interface IgGraphqlResponse {
    data?: {
        xdt_shortcode_media?: IgShortcodeMedia
        shortcode_media?: IgShortcodeMedia
    }
}

/**
 * Optional authenticated cookie. As of 2026 Instagram serves only a logged-out
 * JS shell (no og tags, no media JSON) to anonymous clients, so the resolver
 * needs a real session to reach the media endpoints. Set INSTAGRAM_COOKIE to the
 * raw Cookie header from a logged-in browser (at minimum `sessionid=…`). Treat
 * it as a secret — it's full account access. Alternatively point
 * INSTAGRAM_PROXY_URL at a residential web-unlocker that handles auth for you.
 */
function igCookie(): string | undefined {
    return process.env.INSTAGRAM_COOKIE?.trim() || undefined
}

function apiHeaders(): Record<string, string> {
    const cookie = igCookie()
    return {
        'User-Agent': BROWSER_UA,
        'x-ig-app-id': IG_APP_ID,
        Accept: '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: 'https://www.instagram.com/',
        ...(cookie ? { Cookie: cookie } : {}),
    }
}

function htmlHeaders(): Record<string, string> {
    const cookie = igCookie()
    return {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        ...(cookie ? { Cookie: cookie } : {}),
    }
}

/** Read media URLs from a media-info item, descending into carousels. */
function pickFromMediaItem(item: IgMediaItem): ReelMeta {
    const node = item.carousel_media?.[0] ?? item
    return {
        videoUrl: node.video_versions?.[0]?.url,
        thumbnailUrl: node.image_versions2?.candidates?.[0]?.url,
        caption: item.caption?.text ?? undefined,
    }
}

// T1 — the most reliable door: numeric media id + private media-info endpoint.
async function tryMediaInfoApi(mediaId: string): Promise<ReelMeta | null> {
    const res = await igFetch(
        `https://www.instagram.com/api/v1/media/${mediaId}/info/`,
        { headers: apiHeaders() },
    )
    if (!res.ok) return null
    const json = (await res.json()) as IgMediaInfo
    const item = json.items?.[0]
    return item ? pickFromMediaItem(item) : null
}

// T2 — GraphQL by shortcode (best-effort; doc_id rotates).
async function tryGraphql(shortcode: string): Promise<ReelMeta | null> {
    const body = `doc_id=${GRAPHQL_DOC_ID}&variables=${encodeURIComponent(
        JSON.stringify({ shortcode }),
    )}`
    const res = await igFetch('https://www.instagram.com/graphql/query', {
        method: 'POST',
        headers: {
            ...apiHeaders(),
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
    })
    if (!res.ok) return null
    const json = (await res.json()) as IgGraphqlResponse
    const media = json.data?.xdt_shortcode_media ?? json.data?.shortcode_media
    if (!media) return null
    return {
        videoUrl: media.video_url,
        thumbnailUrl: media.display_url ?? media.thumbnail_src,
        caption: media.edge_media_to_caption?.edges?.[0]?.node?.text,
    }
}

// T3 — the public embed page; its inline JSON carries video_url for many reels.
async function tryEmbed(shortcode: string): Promise<ReelMeta | null> {
    const res = await igFetch(
        `https://www.instagram.com/reel/${shortcode}/embed/captioned/`,
        { headers: htmlHeaders() },
    )
    if (!res.ok) return null
    const html = await res.text()
    const video = matchJsonString(html, 'video_url')
    const thumb =
        matchJsonString(html, 'display_url') ??
        matchJsonString(html, 'thumbnail_src')
    if (video || thumb) {
        return { videoUrl: video ?? undefined, thumbnailUrl: thumb ?? undefined }
    }
    // Embed sometimes only exposes og tags — reuse the meta parser.
    const meta = parseReelMeta(html)
    return meta.videoUrl || meta.thumbnailUrl ? meta : null
}

/** Extract and JSON-unescape the value of a `"key":"..."` pair from raw HTML. */
function matchJsonString(html: string, key: string): string | null {
    const m = html.match(new RegExp(`"${key}":"((?:[^"\\\\]|\\\\.)*)"`))
    if (!m) return null
    try {
        return JSON.parse(`"${m[1]}"`) as string
    } catch {
        return null
    }
}

function sanitizeMeta(meta: ReelMeta): ReelMeta {
    const out: ReelMeta = {}
    if (meta.videoUrl && isAllowedMediaHost(safeHost(meta.videoUrl)))
        out.videoUrl = meta.videoUrl
    if (meta.thumbnailUrl && isAllowedMediaHost(safeHost(meta.thumbnailUrl)))
        out.thumbnailUrl = meta.thumbnailUrl
    if (meta.caption) out.caption = meta.caption.slice(0, 500)
    return out
}

function hasMedia(m: ReelMeta | null): m is ReelMeta {
    return Boolean(m && (m.videoUrl || m.thumbnailUrl))
}

async function safeTry<T>(fn: () => Promise<T>): Promise<T | null> {
    try {
        return await fn()
    } catch {
        return null
    }
}

/**
 * Resolve a public Instagram Reel/post URL to its real media via the technique
 * chain. Returns the first door that yields media (with `technique` set), or an
 * empty object when all fail (caller then asks the user to upload the file).
 */
export async function resolveInstagramMedia(
    normalizedUrl: string,
): Promise<ResolveResult> {
    const shortcode = extractShortcode(normalizedUrl)

    if (shortcode) {
        const mediaId = shortcodeToMediaId(shortcode)
        if (mediaId) {
            const r = await safeTry(() => tryMediaInfoApi(mediaId))
            if (hasMedia(r))
                return { ...sanitizeMeta(r), technique: 'media-info-api' }
        }
        const g = await safeTry(() => tryGraphql(shortcode))
        if (hasMedia(g)) return { ...sanitizeMeta(g), technique: 'graphql' }

        const e = await safeTry(() => tryEmbed(shortcode))
        if (hasMedia(e)) return { ...sanitizeMeta(e), technique: 'embed' }
    }

    // T4 — og tags / embedded JSON from the page HTML (last resort). With a
    // session cookie this returns the logged-in page that still carries og tags.
    const og = await safeTry(async () => {
        const res = await igFetch(normalizedUrl, { headers: htmlHeaders() })
        if (!res.ok) return null
        return parseReelMeta(await res.text())
    })
    if (hasMedia(og)) return { ...sanitizeMeta(og), technique: 'og-tags' }

    return {}
}
