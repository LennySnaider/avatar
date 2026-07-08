import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { textToSpeech } from '@/services/MiniMaxService'
import { uploadBufferToGenerations } from '@/lib/mediaPersist'

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

    const body = await req.json()
    const { text, voiceId, speed, pitch, emotion, language } = body

    if (!text || !voiceId) {
        return NextResponse.json({ error: 'text and voiceId are required' }, { status: 400 })
    }
    if (text.length > 10000) {
        return NextResponse.json({ error: 'Text exceeds 10,000 character limit' }, { status: 400 })
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

        const fileName = `${session.user.id}/audios/${Date.now()}.mp3`
        const audioUrl = await uploadBufferToGenerations(audioBuffer, fileName, 'audio/mpeg')

        return NextResponse.json({ success: true, audioUrl, durationMs, characters })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'TTS generation failed'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
