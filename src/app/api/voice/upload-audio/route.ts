import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { uploadBufferToGenerations } from '@/lib/mediaPersist'

/**
 * Sube un audio procesado en el navegador (p.ej. TTS con EQ horneado vía
 * OfflineAudioContext) al bucket `generations` y devuelve su URL pública,
 * para que lipsync/Speak usen exactamente lo que el usuario escuchó.
 */
export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await req.formData()
    const audio = formData.get('audio') as File | null
    if (!audio) {
        return NextResponse.json({ error: 'audio file is required' }, { status: 400 })
    }
    if (audio.size > 10 * 1024 * 1024) {
        return NextResponse.json({ error: 'Audio exceeds 10MB (KIE lipsync limit)' }, { status: 400 })
    }

    const contentType = audio.type === 'audio/wav' || audio.type === 'audio/x-wav' ? audio.type : 'audio/wav'
    const ext = 'wav'

    try {
        const buffer = Buffer.from(await audio.arrayBuffer())
        const fileName = `${session.user.id}/audios/eq-${Date.now()}.${ext}`
        const audioUrl = await uploadBufferToGenerations(buffer, fileName, contentType)
        return NextResponse.json({ success: true, audioUrl })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
