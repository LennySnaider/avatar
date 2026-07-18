import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import type { VoiceTtsSettings } from '@/@types/voice'
import type { Json } from '@/@types/supabase'
import { getOrgContextForUser } from '@/lib/tenant/getOrgContext'

const EMOTIONS = ['happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised', 'calm', 'neutral'] as const

/** Guarda los ajustes de TTS (speed/pitch/emotion) de una voz clonada. */
export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const ctx = await getOrgContextForUser(session.user.id)
    if (!ctx) {
        return NextResponse.json({ error: 'No organization membership' }, { status: 403 })
    }

    const { voiceId, settings } = await req.json()
    if (!voiceId || typeof settings !== 'object' || settings === null) {
        return NextResponse.json({ error: 'voiceId and settings are required' }, { status: 400 })
    }

    // Sanitizar a los rangos que acepta MiniMax t2a_v2.
    const clean: VoiceTtsSettings = {}
    if (typeof settings.speed === 'number') {
        clean.speed = Math.min(2, Math.max(0.5, settings.speed))
    }
    if (typeof settings.pitch === 'number') {
        clean.pitch = Math.round(Math.min(12, Math.max(-12, settings.pitch)))
    }
    if (EMOTIONS.includes(settings.emotion)) {
        clean.emotion = settings.emotion
    }
    if (typeof settings.useAutoAccent === 'boolean') {
        clean.useAutoAccent = settings.useAutoAccent
    }

    const supabase = createServerSupabaseClient()
    const { data: updated, error } = await supabase
        .from('cloned_voices')
        .update({ tts_settings: clean as unknown as Json })
        .eq('id', voiceId)
        .eq('organization_id', ctx.organizationId)
        .select('id')

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!updated || updated.length === 0) {
        return NextResponse.json({ error: 'Voice not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true, settings: clean })
}
