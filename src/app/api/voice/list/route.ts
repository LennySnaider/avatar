import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getOrgContextForUser } from '@/lib/tenant/getOrgContext'

export async function GET() {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const ctx = await getOrgContextForUser(session.user.id)
    if (!ctx) {
        return NextResponse.json({ error: 'No organization membership' }, { status: 403 })
    }

    const supabase = createServerSupabaseClient()

    const { data: voices, error } = await supabase
        .from('cloned_voices')
        .select('*')
        .eq('organization_id', ctx.organizationId)
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
        .eq('organization_id', ctx.organizationId)

    if (avatarsError) {
        return NextResponse.json({ error: avatarsError.message }, { status: 500 })
    }

    return NextResponse.json({ voices, avatars })
}
