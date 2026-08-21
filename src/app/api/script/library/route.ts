import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { orgTable, orgInsert } from '@/lib/org/orgTable'
import { getOrgContextForUser } from '@/lib/tenant/getOrgContext'

/** Librería de guiones del usuario (tabla audio_scripts). */

export async function GET() {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const ctx = await getOrgContextForUser(session.user.id)
    if (!ctx) {
        return NextResponse.json({ error: 'No organization membership' }, { status: 403 })
    }

    const { data: scripts, error } = await orgTable(ctx, 'audio_scripts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ scripts })
}

export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const ctx = await getOrgContextForUser(session.user.id)
    if (!ctx) {
        return NextResponse.json({ error: 'No organization membership' }, { status: 403 })
    }

    const { title, script_text, language, tone, template_type, duration_target_seconds } = await req.json()
    if (!script_text?.trim()) {
        return NextResponse.json({ error: 'script_text is required' }, { status: 400 })
    }

    const { data: script, error } = await orgInsert(ctx, 'audio_scripts', {
        user_id: session.user.id,
        title: title?.trim() || script_text.trim().slice(0, 40),
        script_text: script_text.trim(),
        language: language || 'es',
        tone: tone || 'professional',
        template_type: template_type || 'custom',
        duration_target_seconds: duration_target_seconds || 30,
        context: {},
    })
        .select()
        .single()

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true, script })
}

export async function DELETE(req: NextRequest) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const ctx = await getOrgContextForUser(session.user.id)
    if (!ctx) {
        return NextResponse.json({ error: 'No organization membership' }, { status: 403 })
    }

    const { id } = await req.json()
    if (!id) {
        return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const { error } = await orgTable(ctx, 'audio_scripts').delete().eq('id', id)

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true })
}
