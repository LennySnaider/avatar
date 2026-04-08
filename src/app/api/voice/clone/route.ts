import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { uploadAudioForCloning, cloneVoice, generateVoiceId } from '@/services/MiniMaxService'

export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await req.formData()
    const audioFile = formData.get('audio') as File | null
    const name = formData.get('name') as string
    const language = (formData.get('language') as string) || 'es'
    const avatarId = formData.get('avatarId') as string | null

    if (!audioFile || !name) {
        return NextResponse.json({ error: 'audio and name are required' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()
    const userId = session.user.id

    try {
        // 1. Upload to Supabase Storage (keep original)
        const storagePath = `${userId}/voices/${Date.now()}-${audioFile.name}`
        const audioBuffer = Buffer.from(await audioFile.arrayBuffer())

        const { error: storageError } = await supabase.storage
            .from('avatars')
            .upload(storagePath, audioBuffer, {
                contentType: audioFile.type,
                upsert: true,
            })
        if (storageError) throw new Error(storageError.message)

        const { data: publicUrlData } = supabase.storage
            .from('avatars')
            .getPublicUrl(storagePath)

        // 2. Upload to MiniMax
        const fileId = await uploadAudioForCloning(audioBuffer, audioFile.name)

        // 3. Clone voice
        const voiceId = await generateVoiceId(userId, name)
        await cloneVoice(fileId, voiceId, `Hola, esta es una prueba de mi voz clonada.`)

        // 4. Save to DB
        const { data: voice, error: dbError } = await supabase
            .from('cloned_voices')
            .insert({
                user_id: userId,
                avatar_id: avatarId || null,
                name,
                provider: 'minimax',
                provider_voice_id: voiceId,
                sample_audio_url: publicUrlData.publicUrl,
                language,
                status: 'ready',
            })
            .select()
            .single()

        if (dbError) throw new Error(dbError.message)

        return NextResponse.json({ success: true, voice })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Voice cloning failed'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
