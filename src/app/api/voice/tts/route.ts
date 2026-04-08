import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { textToSpeech } from '@/services/MiniMaxService'

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

        // Return audio as base64 for easy client consumption
        const base64Audio = audioBuffer.toString('base64')

        return NextResponse.json({
            success: true,
            audio: base64Audio,
            durationMs,
            characters,
            mimeType: 'audio/mpeg',
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'TTS generation failed'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
