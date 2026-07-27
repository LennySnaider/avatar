import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getOrgContextForUser } from '@/lib/tenant/getOrgContext'

/**
 * Reasigna una voz ya clonada a OTRO avatar (o la desvincula con avatarId
 * null). No toca MiniMax: el clon vive en el proveedor y `provider_voice_id`
 * no cambia — aquí solo se mueve el vínculo. Por eso reasignar es gratis,
 * mientras que volver a clonar la misma voz para otro avatar se cobraría.
 *
 * El caso que obliga a que esto sea un endpoint y no un UPDATE suelto: si la
 * voz era la PRINCIPAL (★) del avatar anterior, ese avatar se quedaría
 * apuntando a una voz que ya no le pertenece, y el modo Speak hablaría con la
 * voz de otro personaje. Mover y limpiar tienen que ir juntos.
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

    const { voiceId, avatarId } = (await req.json()) as {
        voiceId?: string
        avatarId?: string | null
    }
    if (!voiceId) {
        return NextResponse.json({ error: 'voiceId is required' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()
    const target = avatarId || null

    const { data: voice, error: voiceError } = await supabase
        .from('cloned_voices')
        .select('id, avatar_id')
        .eq('id', voiceId)
        .eq('organization_id', ctx.organizationId)
        .single()

    if (voiceError || !voice) {
        return NextResponse.json({ error: 'Voice not found' }, { status: 404 })
    }

    // El avatar destino se valida contra la MISMA organización: sin esto, un
    // id copiado a mano movería una voz a un avatar ajeno.
    if (target) {
        const { data: owned } = await supabase
            .from('avatars')
            .select('id')
            .eq('id', target)
            .eq('organization_id', ctx.organizationId)
            .single()
        if (!owned) {
            return NextResponse.json({ error: 'Avatar not found' }, { status: 400 })
        }
    }

    if (target === voice.avatar_id) {
        return NextResponse.json({ success: true, unchanged: true })
    }

    const { error: moveError } = await supabase
        .from('cloned_voices')
        .update({ avatar_id: target })
        .eq('id', voiceId)
        .eq('organization_id', ctx.organizationId)

    if (moveError) {
        return NextResponse.json({ error: moveError.message }, { status: 500 })
    }

    // El `.eq('default_voice_id', voiceId)` hace la limpieza condicional en una
    // sola sentencia: solo se borra la ★ si apuntaba a ESTA voz, así que una
    // voz secundaria se mueve sin tocar la principal del avatar anterior.
    let clearedFrom: string | null = null
    if (voice.avatar_id) {
        const { data: cleared } = await supabase
            .from('avatars')
            .update({ default_voice_id: null })
            .eq('id', voice.avatar_id)
            .eq('organization_id', ctx.organizationId)
            .eq('default_voice_id', voiceId)
            .select('name')
        clearedFrom = cleared?.[0]?.name ?? null
    }

    return NextResponse.json({ success: true, clearedFrom })
}
