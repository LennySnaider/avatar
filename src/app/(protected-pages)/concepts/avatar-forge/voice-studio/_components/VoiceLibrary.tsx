'use client'

import { useVoiceStudioStore } from '../_store/voiceStudioStore'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import type { Avatar } from '@/@types/supabase'

interface VoiceLibraryProps {
    avatars: Avatar[]
}

export default function VoiceLibrary({ avatars }: VoiceLibraryProps) {
    const {
        voices,
        selectedVoiceId,
        setSelectedVoiceId,
        setVoices,
        defaultVoiceOverrides,
        setDefaultVoiceOverride,
    } = useVoiceStudioStore()

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

    const handleSetDefault = async (voiceId: string, avatarId: string) => {
        const res = await fetch('/api/voice/set-default', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ voiceId }),
        })
        if (res.ok) {
            setDefaultVoiceOverride(avatarId, voiceId)
        } else {
            const { error } = await res.json()
            console.error('[voice-library] Failed to set default voice:', error)
        }
    }

    const isMainVoice = (voice: { id: string; avatar_id: string | null }) => {
        if (!voice.avatar_id) return false
        const overridden = defaultVoiceOverrides[voice.avatar_id]
        if (overridden) return overridden === voice.id
        return avatars.find((a) => a.id === voice.avatar_id)?.default_voice_id === voice.id
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
                {voices.map((voice) => {
                    const linkedAvatar = avatars.find((a) => a.id === voice.avatar_id)
                    const isMain = isMainVoice(voice)
                    return (
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
                                <span className="font-medium text-sm">
                                    {voice.name}
                                    {isMain && <span className="ml-1 text-primary" title="Main voice">★</span>}
                                </span>
                                <span className="text-xs text-gray-500">
                                    {voice.language.toUpperCase()}
                                    {linkedAvatar && ` · ${linkedAvatar.name}`}
                                    {' · '}{new Date(voice.created_at).toLocaleDateString()}
                                </span>
                            </div>
                            <div className="flex items-center gap-1">
                                {voice.avatar_id && !isMain && (
                                    <Button
                                        size="xs"
                                        variant="plain"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            handleSetDefault(voice.id, voice.avatar_id!)
                                        }}
                                    >
                                        Make main
                                    </Button>
                                )}
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
                        </div>
                    )
                })}
            </div>
        </Card>
    )
}
