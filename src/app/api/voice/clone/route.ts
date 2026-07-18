import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { uploadAudioForCloning, cloneVoice, generateVoiceId } from '@/services/MiniMaxService'
import { getOrgContextForUser } from '@/lib/tenant/getOrgContext'

export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const ctx = await getOrgContextForUser(session.user.id)
    if (!ctx) {
        return NextResponse.json({ error: 'No organization membership' }, { status: 403 })
    }

    const formData = await req.formData()
    const audioFile = formData.get('audio') as File | null
    const name = formData.get('name') as string
    const language = (formData.get('language') as string) || 'es'
    const avatarId = formData.get('avatarId') as string | null
    const setAsDefault = formData.get('setAsDefault') === 'true'

    if (!audioFile || !name) {
        return NextResponse.json({ error: 'audio and name are required' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()
    const userId = session.user.id

    try {
        // 0. Verify avatar ownership before accepting a client-supplied avatarId
        if (avatarId) {
            const { data: ownedAvatar, error: avatarLookupError } = await supabase
                .from('avatars')
                .select('id')
                .eq('id', avatarId)
                .eq('organization_id', ctx.organizationId)
                .single()

            if (avatarLookupError || !ownedAvatar) {
                return NextResponse.json({ error: 'Avatar not found' }, { status: 400 })
            }
        }

        // 1. Upload original to Supabase Storage (keep original)
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

        // 2. Upload to MiniMax for cloning
        const fileId = await uploadAudioForCloning(audioBuffer, audioFile.name)

        // 3. Clone voice
        const voiceId = await generateVoiceId(userId, name)
        await cloneVoice(fileId, voiceId, `Hola, esta es una prueba de mi voz clonada.`)

        // 4. Save to DB
        const { data: voice, error: dbError } = await supabase
            .from('cloned_voices')
            .insert({
                user_id: userId,
                organization_id: ctx.organizationId,
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

        // 5. Optionally set as the avatar's main voice
        let defaultVoiceSet = false
        if (avatarId && setAsDefault && voice) {
            const { data: updatedAvatars, error: avatarError } = await supabase
                .from('avatars')
                .update({ default_voice_id: voice.id })
                .eq('id', avatarId)
                .eq('organization_id', ctx.organizationId)
                .select('id')
            if (avatarError) {
                console.error('[voice/clone] Failed to set default voice:', avatarError.message)
            } else {
                defaultVoiceSet = (updatedAvatars?.length ?? 0) > 0
            }
        }

        return NextResponse.json({ success: true, voice, defaultVoiceSet })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Voice cloning failed'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
