import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { auth } from '@/auth'
import {
    BROWSER_UA,
    isAllowedMediaHost,
    normalizeInstagramUrl,
    parseReelMeta,
} from '../_lib/instagram'

// Fetching the page + cover can take a few seconds on cold CDNs.
export const maxDuration = 60

interface ExtractResponse {
    ok: boolean
    /** Direct CDN video URL when the public page exposes og:video. */
    videoUrl?: string
    /** CDN cover image URL (og:image) — almost always present. */
    thumbnailUrl?: string
    /** Cover frame already fetched + base64-encoded for direct Gemini analysis. */
    thumbnailBase64?: string
    thumbnailMimeType?: string
    caption?: string
    /** True when nothing usable was found → client must ask the user to upload. */
    needsUpload: boolean
    /** Human-readable reason shown in the UI when needsUpload is true. */
    reason?: string
}

export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let url: string
    try {
        const body = await req.json()
        url = body?.url
    } catch {
        return NextResponse.json(
            { error: 'Invalid JSON body' },
            { status: 400 },
        )
    }

    const normalized = url ? normalizeInstagramUrl(url) : null
    if (!normalized) {
        return NextResponse.json(
            {
                error: 'Provide a valid Instagram Reel URL (e.g. https://www.instagram.com/reel/XXXX/)',
            },
            { status: 400 },
        )
    }

    try {
        const res = await fetch(normalized, {
            headers: {
                'User-Agent': BROWSER_UA,
                Accept: 'text/html,application/xhtml+xml',
                'Accept-Language': 'en-US,en;q=0.9',
            },
            redirect: 'follow',
        })

        // A blocked/login-walled page still returns 200 with no media, so we
        // don't hard-fail on !res.ok — we parse what we got and let the
        // needsUpload fallback handle the empty case.
        const html = res.ok ? await res.text() : ''
        const meta = parseReelMeta(html)

        // Pre-fetch the cover frame as base64 so the client can run the "look"
        // analysis with zero canvas/CORS work. Best-effort: a failure here just
        // means the client extracts a frame from the (proxied) video instead.
        let thumbnailBase64: string | undefined
        let thumbnailMimeType: string | undefined
        if (meta.thumbnailUrl && isAllowedMediaHost(new URL(meta.thumbnailUrl).hostname)) {
            try {
                const imgRes = await fetch(meta.thumbnailUrl, {
                    headers: { 'User-Agent': BROWSER_UA },
                })
                if (imgRes.ok) {
                    const buf = Buffer.from(await imgRes.arrayBuffer())
                    // Guard against a multi-MB cover sneaking through.
                    if (buf.length <= 8 * 1024 * 1024) {
                        thumbnailMimeType =
                            imgRes.headers.get('content-type') || 'image/jpeg'
                        thumbnailBase64 = buf.toString('base64')
                    }
                }
            } catch {
                // ignore — fall back to client-side frame extraction
            }
        }

        const hasAnything = Boolean(meta.videoUrl || meta.thumbnailUrl)
        const payload: ExtractResponse = {
            ok: true,
            videoUrl: meta.videoUrl,
            thumbnailUrl: meta.thumbnailUrl,
            thumbnailBase64,
            thumbnailMimeType,
            caption: meta.caption,
            needsUpload: !hasAnything,
            reason: hasAnything
                ? undefined
                : 'Instagram did not expose this Reel publicly. Download the video and upload the file instead.',
        }
        return NextResponse.json(payload)
    } catch (error) {
        // Network/parse failure → tell the client to use the upload fallback
        // rather than surfacing a hard error.
        const message =
            error instanceof Error ? error.message : 'Failed to fetch the Reel'
        return NextResponse.json({
            ok: true,
            needsUpload: true,
            reason: `Could not reach Instagram (${message}). Upload the video file instead.`,
        } satisfies ExtractResponse)
    }
}
