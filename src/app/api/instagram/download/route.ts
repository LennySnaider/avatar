import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { auth } from '@/auth'
import {
    BROWSER_UA,
    extractShortcode,
    igFetch,
    isAllowedMediaHost,
    normalizeInstagramUrl,
    resolveInstagramMedia,
} from '../_lib/instagram'

// Resolving the Reel (media-info API → GraphQL → embed → og) plus streaming the
// video from the CDN can take a few seconds, especially through a proxy.
export const maxDuration = 60

/**
 * Snapinsta-style direct downloader. Paste a Reel URL → this route resolves the
 * media and streams the MP4 back with `Content-Disposition: attachment`, so the
 * browser saves it as a file instead of playing it.
 *
 * GET /api/instagram/download?url=https://www.instagram.com/reel/XXXX/
 *
 * Hardened: only the resolved CDN video URL is streamed (host allowlist), the
 * caller never controls the upstream host directly.
 */
export async function GET(req: NextRequest) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const raw = req.nextUrl.searchParams.get('url')
    const normalized = raw ? normalizeInstagramUrl(raw) : null
    if (!normalized) {
        return NextResponse.json(
            {
                error: 'Provide a valid Instagram Reel URL (e.g. https://www.instagram.com/reel/XXXX/)',
            },
            { status: 400 },
        )
    }

    let videoUrl: string | undefined
    try {
        const meta = await resolveInstagramMedia(normalized)
        videoUrl = meta.videoUrl
    } catch (error) {
        const message =
            error instanceof Error ? error.message : 'Failed to reach Instagram'
        return NextResponse.json(
            { error: `Could not resolve the Reel (${message})` },
            { status: 502 },
        )
    }

    if (!videoUrl || !isAllowedMediaHost(new URL(videoUrl).hostname)) {
        return NextResponse.json(
            {
                error: 'Instagram did not expose a downloadable video for this Reel. It may be private, deleted, or require a logged-in session (set INSTAGRAM_COOKIE / INSTAGRAM_PROXY_URL).',
            },
            { status: 404 },
        )
    }

    try {
        const upstream = await igFetch(videoUrl, {
            headers: {
                'User-Agent': BROWSER_UA,
                // The IG CDN 403s without a Referer from its own origin.
                Referer: 'https://www.instagram.com/',
            },
        })

        if (!upstream.ok || !upstream.body) {
            return NextResponse.json(
                { error: `Upstream ${upstream.status}` },
                { status: 502 },
            )
        }

        const shortcode = extractShortcode(normalized) || 'reel'
        const contentType =
            upstream.headers.get('content-type') || 'video/mp4'
        const contentLength = upstream.headers.get('content-length')

        const headers: Record<string, string> = {
            'Content-Type': contentType,
            'Content-Disposition': `attachment; filename="instagram-${shortcode}.mp4"`,
            'Cache-Control': 'private, no-store',
        }
        if (contentLength) headers['Content-Length'] = contentLength

        // Stream the bytes straight through — no buffering the whole video.
        return new NextResponse(upstream.body, { status: 200, headers })
    } catch (error) {
        const message =
            error instanceof Error ? error.message : 'Download failed'
        return NextResponse.json({ error: message }, { status: 502 })
    }
}
