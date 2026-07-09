import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET() {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServerSupabaseClient()

    const { data: voices, error } = await supabase
        .from('cloned_voices')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('status', 'ready')
        .order('created_at', { ascending: false })

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Mapeo vivo avatar↔voz-default: la UI de Your Voices marca la ★ con esto
    // (la lista SSR de avatares queda stale tras re-clonar/re-asignar).
    const { data: avatars, error: avatarsError } = await supabase
        .from('avatars')
        .select('id, name, default_voice_id')
        .eq('user_id', session.user.id)

    if (avatarsError) {
        return NextResponse.json({ error: avatarsError.message }, { status: 500 })
    }

    return NextResponse.json({ voices, avatars })
}
