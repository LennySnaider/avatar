import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createServerSupabaseClient } from '@/lib/supabase'

/** Marca una voz clonada como voz principal de su avatar vinculado. */
export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { voiceId } = await req.json()
    if (!voiceId) {
        return NextResponse.json({ error: 'voiceId is required' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()
    const { data: voice, error: voiceError } = await supabase
        .from('cloned_voices')
        .select('id, avatar_id')
        .eq('id', voiceId)
        .eq('user_id', session.user.id)
        .single()

    if (voiceError || !voice) {
        return NextResponse.json({ error: 'Voice not found' }, { status: 404 })
    }
    if (!voice.avatar_id) {
        return NextResponse.json({ error: 'Voice is not linked to an avatar' }, { status: 400 })
    }

    const { data: updatedAvatars, error: updateError } = await supabase
        .from('avatars')
        .update({ default_voice_id: voice.id })
        .eq('id', voice.avatar_id)
        .eq('user_id', session.user.id)
        .select('id')

    if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
    }
    if (!updatedAvatars || updatedAvatars.length === 0) {
        return NextResponse.json({ error: 'Avatar not found or not owned by you' }, { status: 404 })
    }
    return NextResponse.json({ success: true })
}
