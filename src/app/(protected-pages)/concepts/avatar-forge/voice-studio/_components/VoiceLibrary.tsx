'use client'

import { useVoiceStudioStore } from '../_store/voiceStudioStore'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

export default function VoiceLibrary() {
    const { voices, selectedVoiceId, setSelectedVoiceId, setVoices } = useVoiceStudioStore()

    const handleDelete = async (id: string) => {
        const res = await fetch('/api/voice/delete', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
        })
        if (res.ok) {
            setVoices(voices.filter((v) => v.id !== id))
            if (selectedVoiceId === id) setSelectedVoiceId(null)
        }
    }

    if (voices.length === 0) {
        return (
            <Card>
                <div className="p-4 text-center text-sm text-gray-500">
                    No voices cloned yet. Upload an audio sample to get started.
                </div>
            </Card>
        )
    }

    return (
        <Card>
            <div className="p-4 flex flex-col gap-2">
                <h3 className="font-semibold text-lg">Your Voices</h3>
                {voices.map((voice) => (
                    <div
                        key={voice.id}
                        className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                            selectedVoiceId === voice.id
                                ? 'bg-primary/10 border border-primary'
                                : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                        onClick={() => setSelectedVoiceId(voice.id)}
                    >
                        <div className="flex flex-col">
                            <span className="font-medium text-sm">{voice.name}</span>
                            <span className="text-xs text-gray-500">
                                {voice.language.toUpperCase()} · {new Date(voice.created_at).toLocaleDateString()}
                            </span>
                        </div>
                        <Button
                            size="xs"
                            variant="plain"
                            onClick={(e) => {
                                e.stopPropagation()
                                handleDelete(voice.id)
                            }}
                        >
                            Delete
                        </Button>
                    </div>
                ))}
            </div>
        </Card>
    )
}
