import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { listProviderClonedVoices } from '@/services/MiniMaxService'
import { getOrgContextForUser } from '@/lib/tenant/getOrgContext'

/**
 * Rescata los clones HUÉRFANOS: voces que existen (y están pagadas) en
 * MiniMax pero sin fila en `cloned_voices`, así que la app no las ve. El
 * 2026-07-26 eran 3 de 5.
 *
 * Importar no llama a ninguna generación — solo lee el inventario y escribe
 * filas —, así que es gratis. Una voz clonada no necesita nada más que su
 * `provider_voice_id` para volver a sonar: el clon vive en el proveedor.
 *
 * Idempotente: lo que ya tiene fila se ignora, así que se puede pulsar sin
 * miedo a duplicar.
 */

/**
 * `generateVoiceId` arma el id como `pa` + las 4 primeras letras del nombre
 * (o el literal 'voice' si el nombre era más corto) + 8 chars del user id +
 * un timestamp. El id de usuario es la referencia FIJA, así que localizarlo
 * es lo que permite recortar el prefijo con exactitud en vez de adivinar
 * dónde acaba.
 */
function nameFromVoiceId(voiceId: string, userId: string, createdTime: string | null): string {
    const marker = userId.replace(/-/g, '').slice(0, 8)
    const idx = voiceId.indexOf(marker)
    const prefix = idx > 2 ? voiceId.slice(2, idx) : ''
    if (prefix && prefix !== 'voice') {
        // Son 4 letras del nombre original: pista, no nombre. Los puntos
        // suspensivos lo admiten en vez de inventar una palabra entera.
        return `${prefix.charAt(0).toUpperCase()}${prefix.slice(1)}… (recovered)`
    }
    return `Recovered voice${createdTime ? ` ${createdTime}` : ''}`
}

export async function POST() {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const ctx = await getOrgContextForUser(session.user.id)
    if (!ctx) {
        return NextResponse.json({ error: 'No organization membership' }, { status: 403 })
    }

    const userId = session.user.id
    const supabase = createServerSupabaseClient()

    let remote: { voiceId: string; createdTime: string | null }[]
    try {
        remote = await listProviderClonedVoices()
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Could not read MiniMax voices' },
            { status: 502 },
        )
    }

    const { data: existing, error: readError } = await supabase
        .from('cloned_voices')
        .select('provider_voice_id')
        .eq('organization_id', ctx.organizationId)

    if (readError) {
        return NextResponse.json({ error: readError.message }, { status: 500 })
    }

    const known = new Set((existing ?? []).map((v) => v.provider_voice_id))
    const orphans = remote.filter((v) => !known.has(v.voiceId))

    if (orphans.length === 0) {
        return NextResponse.json({ success: true, recovered: 0, voices: [] })
    }

    const { data: inserted, error: insertError } = await supabase
        .from('cloned_voices')
        .insert(
            orphans.map((v) => ({
                user_id: userId,
                organization_id: ctx.organizationId,
                avatar_id: null,
                name: nameFromVoiceId(v.voiceId, userId, v.createdTime),
                provider: 'minimax',
                provider_voice_id: v.voiceId,
                // La muestra original vivía en nuestro Storage y no se guardó
                // referencia. La columna es NOT NULL y nadie la lee en la UI,
                // así que vacía es más honesto que una URL inventada.
                sample_audio_url: '',
                language: 'es',
                status: 'ready',
            })),
        )
        .select('id, name, provider_voice_id')

    if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({
        success: true,
        recovered: inserted?.length ?? 0,
        voices: inserted ?? [],
    })
}
