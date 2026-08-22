import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { orgTable } from '@/lib/org/orgTable'
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

    const { data: voices, error } = await orgTable(ctx, 'cloned_voices')
        .select('*')
        .eq('status', 'ready')
        .order('created_at', { ascending: false })

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Mapeo vivo avatar↔voz-default: la UI de Your Voices marca la ★ con esto
    // (la lista SSR de avatares queda stale tras re-clonar/re-asignar).
    const { data: avatars, error: avatarsError } = await orgTable(ctx, 'avatars').select(
        'id, name, default_voice_id',
    )

    if (avatarsError) {
        return NextResponse.json({ error: avatarsError.message }, { status: 500 })
    }

    return NextResponse.json({ voices, avatars })
}
