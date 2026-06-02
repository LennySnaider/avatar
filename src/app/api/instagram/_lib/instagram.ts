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
