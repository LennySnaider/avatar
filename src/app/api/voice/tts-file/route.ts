import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { textToSpeech } from '@/services/MiniMaxService'
import { uploadBufferToGenerations } from '@/lib/mediaPersist'
import { orgStoragePath } from '@/lib/storagePaths'
import { orgTable } from '@/lib/org/orgTable'
import { getOrgContextForUser } from '@/lib/tenant/getOrgContext'
import { ctxCan } from '@/lib/org/guards'

/**
 * TTS que PERSISTE el mp3 en el bucket `generations` y devuelve una URL
 * pública. Los modelos de lipsync de KIE (InfiniteTalk / Volcengine) solo
 * aceptan audio por URL HTTP, no base64 — este endpoint es el habilitador
 * de todo el pipeline audio → video.
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
    if (!ctxCan(ctx, 'generation:create')) {
        return NextResponse.json({ error: 'Tu rol no puede lanzar generaciones.' }, { status: 403 })
    }

    const body = await req.json()
    const { text, voiceId, speed, pitch, emotion, language } = body

    if (!text || !voiceId) {
        return NextResponse.json({ error: 'text and voiceId are required' }, { status: 400 })
    }
    if (text.length > 10000) {
        return NextResponse.json({ error: 'Text exceeds 10,000 character limit' }, { status: 400 })
    }

    // La voz tiene que ser de ESTA organizacion. Sin esta comprobacion, el
    // `voiceId` llega del cliente y va directo a MiniMax: bastaba adivinar (o
    // ver una vez) el provider_voice_id de otro tenant para hablar con su voz
    // clonada, y encima gastando nuestro proveedor. Es el mismo candado
    // anti-IDOR que ya hacen preview, assign y rename sobre `cloned_voices`.
    const { data: voice, error: voiceError } = await orgTable(ctx, 'cloned_voices')
        .select('id')
        .eq('provider_voice_id', voiceId)
        .maybeSingle()
    if (voiceError) {
        console.error('[voice/tts-file] fallo al comprobar la voz', voiceError)
        return NextResponse.json({ error: voiceError.message }, { status: 500 })
    }
    if (!voice) {
        return NextResponse.json({ error: 'Not your voice' }, { status: 404 })
    }

    try {
        const { audioBuffer, durationMs, characters } = await textToSpeech({
            text,
            voiceId,
            speed,
            pitch,
            emotion,
            language,
        })

        const fileName = orgStoragePath(
            ctx.organizationId,
            'audios',
            `${Date.now()}.mp3`,
        )
        const audioUrl = await uploadBufferToGenerations(audioBuffer, fileName, 'audio/mpeg')

        return NextResponse.json({ success: true, audioUrl, durationMs, characters })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'TTS generation failed'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
