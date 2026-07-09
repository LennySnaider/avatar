'use client'

import { useRef, useState } from 'react'
import { useVoiceStudioStore, refreshVoices } from '../_store/voiceStudioStore'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import type { Avatar } from '@/@types/supabase'

interface VoiceLibraryProps {
    avatars: Avatar[]
}

export default function VoiceLibrary({ avatars }: VoiceLibraryProps) {
    const {
        voices,
        voiceAvatars,
        selectedVoiceId,
        setSelectedVoiceId,
        setVoices,
        setPreviewAudioUrl,
        bumpSettingsEdit,
    } = useVoiceStudioStore()

    // "Edit": selecciona la voz, carga sus ajustes guardados en los sliders y
    // pone su audio de preview en el player — así Speed/Bass/Treble (live)
    // se pueden mover de inmediato sin generar un audio nuevo.
    const handleEdit = async (voiceId: string) => {
        setSelectedVoiceId(voiceId)
        bumpSettingsEdit()
        const voice = voices.find((v) => v.id === voiceId)
        let url = voice?.preview_audio_url ?? null
        if (!url) {
            try {
                const res = await fetch('/api/voice/preview', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ voiceId }),
                })
                if (res.ok) {
                    const { previewUrl } = await res.json()
                    url = previewUrl
                    setVoices(voices.map((v) => (v.id === voiceId ? { ...v, preview_audio_url: previewUrl } : v)))
                }
            } catch (err) {
                console.error('Failed to load voice preview for editing:', err)
            }
        }
        if (url) setPreviewAudioUrl(url)
    }

    // Preview de la voz clonada: un solo <audio> compartido; la primera vez
    // el endpoint genera la frase TTS y la cachea en la voz.
    const previewAudioRef = useRef<HTMLAudioElement | null>(null)
    const [previewingId, setPreviewingId] = useState<string | null>(null)
    const [loadingPreviewId, setLoadingPreviewId] = useState<string | null>(null)

    const stopPreview = () => {
        previewAudioRef.current?.pause()
        previewAudioRef.current = null
        setPreviewingId(null)
    }

    const handlePreview = async (voiceId: string) => {
        if (previewingId === voiceId) {
            stopPreview()
            return
        }
        stopPreview()
        setLoadingPreviewId(voiceId)
        try {
            const voice = voices.find((v) => v.id === voiceId)
            let url = voice?.preview_audio_url
            if (!url) {
                const res = await fetch('/api/voice/preview', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ voiceId }),
                })
                if (!res.ok) {
                    const { error } = await res.json()
                    throw new Error(error || 'Preview failed')
                }
                const { previewUrl } = await res.json()
                url = previewUrl
                setVoices(voices.map((v) => (v.id === voiceId ? { ...v, preview_audio_url: previewUrl } : v)))
            }
            const audio = new Audio(url!)
            previewAudioRef.current = audio
            setPreviewingId(voiceId)
            audio.onended = () => setPreviewingId(null)
            await audio.play()
        } catch (err) {
            console.error('Voice preview failed:', err)
            setPreviewingId(null)
        } finally {
            setLoadingPreviewId(null)
        }
    }

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

    const handleSetDefault = async (voiceId: string) => {
        const res = await fetch('/api/voice/set-default', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ voiceId }),
        })
        if (res.ok) {
            // La ★ sale del mapeo vivo — re-consultar es la única verdad.
            await refreshVoices()
        } else {
            const { error } = await res.json()
            console.error('[voice-library] Failed to set default voice:', error)
        }
    }

    // ★ desde el mapeo VIVO (refreshVoices); el prop SSR `avatars` solo es
    // fallback de nombre para el primer render.
    const isMainVoice = (voice: { id: string; avatar_id: string | null }) => {
        if (!voice.avatar_id) return false
        const live = voiceAvatars.find((a) => a.id === voice.avatar_id)
        if (live) return live.default_voice_id === voice.id
        return avatars.find((a) => a.id === voice.avatar_id)?.default_voice_id === voice.id
    }

    const avatarNameFor = (avatarId: string | null) => {
        if (!avatarId) return null
        return (
            voiceAvatars.find((a) => a.id === avatarId)?.name ??
            avatars.find((a) => a.id === avatarId)?.name ??
            null
        )
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
                    const linkedAvatarName = avatarNameFor(voice.avatar_id)
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
                                    {linkedAvatarName && ` · ${linkedAvatarName}`}
                                    {' · '}{new Date(voice.created_at).toLocaleDateString()}
                                </span>
                            </div>
                            <div className="flex items-center gap-1">
                                <Button
                                    size="xs"
                                    variant="plain"
                                    title="Load this voice's saved delivery into the sliders (and its preview audio into the player)"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        handleEdit(voice.id)
                                    }}
                                >
                                    Edit
                                </Button>
                                <Button
                                    size="xs"
                                    variant="plain"
                                    title="Preview cloned voice"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        handlePreview(voice.id)
                                    }}
                                >
                                    {loadingPreviewId === voice.id ? (
                                        <Spinner size={14} />
                                    ) : previewingId === voice.id ? (
                                        '⏸'
                                    ) : (
                                        '▶'
                                    )}
                                </Button>
                                {voice.avatar_id && !isMain && (
                                    <Button
                                        size="xs"
                                        variant="plain"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            handleSetDefault(voice.id)
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
