import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { BROWSER_UA, isAllowedMediaHost } from '../_lib/instagram'

// Reels are short but can be a few MB; allow time to stream from the CDN.
export const maxDuration = 60

/**
 * Same-origin media proxy. The client fetches the Instagram CDN video through
 * THIS route (same origin), turns the response into a Blob → object URL, and
 * loads that into a hidden <video> for canvas frame capture. Going through our
 * origin is what keeps the canvas un-tainted (the Instagram CDN sends no CORS
 * headers, so a direct cross-origin <video> would poison toDataURL()).
 *
 * Hardened against SSRF: the `u` host MUST be on the Instagram/Facebook CDN
 * allowlist, otherwise this would be an open proxy to any URL.
 */
export async function GET(req: NextRequest) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const target = req.nextUrl.searchParams.get('u')
    if (!target) {
        return NextResponse.json({ error: 'Missing url' }, { status: 400 })
    }

    let parsed: URL
    try {
        parsed = new URL(target)
    } catch {
        return NextResponse.json({ error: 'Invalid url' }, { status: 400 })
    }

    if (parsed.protocol !== 'https:' || !isAllowedMediaHost(parsed.hostname)) {
        return NextResponse.json(
            { error: 'Host not allowed' },
            { status: 403 },
        )
    }

    try {
        const upstream = await fetch(parsed.toString(), {
            headers: {
                'User-Agent': BROWSER_UA,
                // Instagram CDN sometimes 403s without a Referer from its origin.
                Referer: 'https://www.instagram.com/',
            },
        })

        if (!upstream.ok || !upstream.body) {
            return NextResponse.json(
                { error: `Upstream ${upstream.status}` },
                { status: 502 },
            )
        }

        const contentType =
            upstream.headers.get('content-type') || 'application/octet-stream'

        // Stream the bytes straight through — no buffering the whole video in
        // memory. Same-origin response → the browser canvas stays clean.
        return new NextResponse(upstream.body, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'private, max-age=300',
            },
        })
    } catch (error) {
        const message =
            error instanceof Error ? error.message : 'Proxy fetch failed'
        return NextResponse.json({ error: message }, { status: 502 })
    }
}
