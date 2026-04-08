import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { mergeAudioVideo } from '@/services/AudioMergeService'

export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { videoUrl, audioBase64, outputFilename } = body

    if (!videoUrl || !audioBase64) {
        return NextResponse.json(
            { error: 'videoUrl and audioBase64 are required' },
            { status: 400 }
        )
    }

    try {
        const audioBuffer = Buffer.from(audioBase64, 'base64')

        const result = await mergeAudioVideo({
            videoUrl,
            audioBuffer,
            userId: session.user.id,
            outputFilename,
        })

        return NextResponse.json({
            success: true,
            ...result,
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Audio merge failed'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
