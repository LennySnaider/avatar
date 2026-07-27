import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getOrgContextForUser } from '@/lib/tenant/getOrgContext'

/** Tope generoso: el nombre solo etiqueta la voz en la UI, pero sin límite una
 * pegada de texto rompería el layout de la lista. */
const MAX_NAME = 60

/**
 * Renombra una voz clonada. Es SOLO nuestra etiqueta: `provider_voice_id` no
 * se toca, porque ese id ya está registrado en MiniMax y es el que usan TTS,
 * Speak y Lipsync. Cambiarlo dejaría la voz inalcanzable — y regenerarlo
 * significaría volver a clonar, que sí se cobra.
 *
 * (Por eso el nombre original se cuela en el id: `generateVoiceId` lo usa al
 * crear la voz. Ese id queda congelado con el nombre viejo, y no pasa nada:
 * nadie lo lee más que MiniMax.)
 */
export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const ctx = await getOrgContextForUser(session.user.id)
    if (!ctx) {
        return NextResponse.json({ error: 'No organization membership' }, { status: 403 })
    }

    const { voiceId, name } = (await req.json()) as { voiceId?: string; name?: string }
    const clean = (name ?? '').trim()

    if (!voiceId) {
        return NextResponse.json({ error: 'voiceId is required' }, { status: 400 })
    }
    if (!clean) {
        return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
    }
    if (clean.length > MAX_NAME) {
        return NextResponse.json(
            { error: `Name is too long (max ${MAX_NAME} characters)` },
            { status: 400 },
        )
    }

    const supabase = createServerSupabaseClient()
    const { data: updated, error } = await supabase
        .from('cloned_voices')
        .update({ name: clean })
        .eq('id', voiceId)
        .eq('organization_id', ctx.organizationId)
        .select('id, name')

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!updated || updated.length === 0) {
        return NextResponse.json({ error: 'Voice not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, name: updated[0].name })
}
