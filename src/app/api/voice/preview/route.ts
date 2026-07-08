import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { textToSpeech } from '@/services/MiniMaxService'
import { uploadBufferToGenerations } from '@/lib/mediaPersist'
import type { VoiceTtsSettings } from '@/@types/voice'

const PREVIEW_PHRASES: Record<string, { text: string; language: string }> = {
    es: { text: 'Hola, así suena mi voz clonada. ¿Qué te parece?', language: 'Spanish' },
    en: { text: 'Hi there — this is how my cloned voice sounds. What do you think?', language: 'English' },
    pt: { text: 'Olá, é assim que soa a minha voz clonada. O que achas?', language: 'Portuguese' },
    fr: { text: 'Bonjour, voici le son de ma voix clonée. Qu\'en penses-tu ?', language: 'French' },
}

/**
 * Devuelve un audio de preview de la voz clonada. Se genera UNA vez (frase
 * corta TTS con los ajustes guardados de la voz), se persiste en Storage y se
 * cachea en `cloned_voices.preview_audio_url` — las siguientes llamadas son
 * instantáneas y gratis.
 */
export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { voiceId, force } = await req.json()
    if (!voiceId) {
        return NextResponse.json({ error: 'voiceId is required' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()
    const { data: voice, error: voiceError } = await supabase
        .from('cloned_voices')
        .select('id, provider_voice_id, language, status, tts_settings, preview_audio_url')
        .eq('id', voiceId)
        .eq('user_id', session.user.id)
        .single()

    if (voiceError || !voice) {
        return NextResponse.json({ error: 'Voice not found' }, { status: 404 })
    }
    if (voice.status !== 'ready') {
        return NextResponse.json({ error: 'Voice is not ready yet' }, { status: 400 })
    }
    if (voice.preview_audio_url && !force) {
        return NextResponse.json({ success: true, previewUrl: voice.preview_audio_url, cached: true })
    }

    try {
        const phrase = PREVIEW_PHRASES[voice.language] ?? PREVIEW_PHRASES.en
        const settings = (voice.tts_settings ?? {}) as VoiceTtsSettings
        const { audioBuffer } = await textToSpeech({
            text: phrase.text,
            voiceId: voice.provider_voice_id,
            // 'auto' deja mandar el acento de la muestra clonada.
            language: settings.useAutoAccent ? 'auto' : phrase.language,
            ...settings,
        })

        const fileName = `${session.user.id}/audios/preview-${voice.id}-${Date.now()}.mp3`
        const previewUrl = await uploadBufferToGenerations(audioBuffer, fileName, 'audio/mpeg')

        const { error: updateError } = await supabase
            .from('cloned_voices')
            .update({ preview_audio_url: previewUrl })
            .eq('id', voice.id)
            .eq('user_id', session.user.id)
        if (updateError) {
            // El preview ya existe en Storage — devolverlo aunque no se cachee.
            console.error('[voice/preview] Failed to cache preview URL:', updateError.message)
        }

        return NextResponse.json({ success: true, previewUrl, cached: false })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Preview generation failed'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
