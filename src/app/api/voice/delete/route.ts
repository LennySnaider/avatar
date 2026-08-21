import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { orgTable } from '@/lib/org/orgTable'
import { getOrgContextForUser } from '@/lib/tenant/getOrgContext'

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
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    // orgTable ya lleva el filtro por organization_id (antes iba a mano sobre
    // el cliente crudo, F4.2.d).
    const { error } = await orgTable(ctx, 'cloned_voices').delete().eq('id', id)

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}
