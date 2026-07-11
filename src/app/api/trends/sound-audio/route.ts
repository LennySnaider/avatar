/**
 * GET /api/trends/sound-audio?id=<trending_sounds.id>
 *
 * Same-origin proxy for a trending sound's audio stream. The browser can't
 * fetch TikTok's CDN directly (CORS), and letting the client pass an arbitrary
 * URL to proxy would be an SSRF hole — so we look the sound up by id and only
 * ever fetch the play_url we stored ourselves.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { trendsSupabase } from '@/lib/trends/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(request: NextRequest) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const supabase = trendsSupabase()
    const { data: sound } = await supabase
        .from('trending_sounds')
        .select('play_url')
        .eq('id', id)
        .maybeSingle()
    if (!sound?.play_url) {
        return NextResponse.json({ error: 'Sound not found or has no audio' }, { status: 404 })
    }

    let upstream: Response
    try {
        upstream = await fetch(sound.play_url, {
            headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.tiktok.com/' },
        })
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : 'Failed to fetch audio' },
            { status: 502 },
        )
    }
    if (!upstream.ok || !upstream.body) {
        return NextResponse.json({ error: `Upstream ${upstream.status}` }, { status: 502 })
    }

    return new NextResponse(upstream.body, {
        status: 200,
        headers: {
            'Content-Type': upstream.headers.get('content-type') ?? 'audio/mpeg',
            'Cache-Control': 'private, max-age=3600',
        },
    })
}
