'use client'

import { useRef } from 'react'
import { useVoiceStudioStore } from '../_store/voiceStudioStore'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'

export default function AudioPreview() {
    const {
        currentScript, selectedVoiceId, voices,
        previewAudioUrl, setPreviewAudioUrl,
        isGeneratingAudio, setIsGeneratingAudio,
        scriptLanguage,
    } = useVoiceStudioStore()
    const audioRef = useRef<HTMLAudioElement>(null)

    const selectedVoice = voices.find((v) => v.id === selectedVoiceId)

    const handleGenerateAudio = async () => {
        if (!currentScript || !selectedVoice) return

        setIsGeneratingAudio(true)
        try {
            const res = await fetch('/api/voice/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: currentScript,
                    voiceId: selectedVoice.provider_voice_id,
                    language: scriptLanguage === 'es' ? 'Spanish' : scriptLanguage === 'en' ? 'English' : scriptLanguage,
                }),
            })

            if (!res.ok) throw new Error('TTS failed')
            const { audio, mimeType } = await res.json()

            const audioUrl = `data:${mimeType};base64,${audio}`
            setPreviewAudioUrl(audioUrl)
        } catch (err) {
            console.error('TTS generation failed:', err)
        } finally {
            setIsGeneratingAudio(false)
        }
    }

    return (
        <Card>
            <div className="p-4 flex flex-col gap-3">
                <h3 className="font-semibold text-lg">Audio Preview</h3>

                {!selectedVoice && (
                    <p className="text-sm text-gray-500">Select a voice from the library first.</p>
                )}
                {selectedVoice && !currentScript && (
                    <p className="text-sm text-gray-500">Write or generate a script first.</p>
                )}

                {selectedVoice && (
                    <div className="text-sm bg-gray-50 dark:bg-gray-800 rounded-md p-2">
                        Voice: <strong>{selectedVoice.name}</strong> ({selectedVoice.language.toUpperCase()})
                    </div>
                )}

                <Button
                    onClick={handleGenerateAudio}
                    loading={isGeneratingAudio}
                    disabled={!currentScript || !selectedVoice || isGeneratingAudio}
                    variant="solid"
                    block
                >
                    {isGeneratingAudio ? 'Generating audio...' : 'Generate Audio'}
                </Button>

                {previewAudioUrl && (
                    <audio
                        ref={audioRef}
                        controls
                        src={previewAudioUrl}
                        className="w-full"
                    />
                )}
            </div>
        </Card>
    )
}
