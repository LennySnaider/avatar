'use client'

import { useState, useRef } from 'react'
import { useVoiceStudioStore } from '../_store/voiceStudioStore'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Card from '@/components/ui/Card'
import type { Avatar } from '@/@types/supabase'

interface VoiceClonePanelProps {
    avatars: Avatar[]
}

export default function VoiceClonePanel({ avatars }: VoiceClonePanelProps) {
    const { setVoices, voices, setIsCloning, isCloning, setDefaultVoiceOverride } = useVoiceStudioStore()
    const [name, setName] = useState('')
    const [language, setLanguage] = useState('es')
    const [audioFile, setAudioFile] = useState<File | null>(null)
    const [avatarId, setAvatarId] = useState('')
    const [setAsDefault, setSetAsDefault] = useState(true)
    const [warning, setWarning] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleClone = async () => {
        if (!audioFile || !name) return

        setIsCloning(true)
        setWarning(null)
        try {
            const formData = new FormData()
            formData.append('audio', audioFile)
            formData.append('name', name)
            formData.append('language', language)
            if (avatarId) {
                formData.append('avatarId', avatarId)
                formData.append('setAsDefault', String(setAsDefault))
            }

            const res = await fetch('/api/voice/clone', {
                method: 'POST',
                body: formData,
            })

            if (!res.ok) {
                const { error } = await res.json()
                throw new Error(error)
            }

            const { voice, defaultVoiceSet } = await res.json()
            setVoices([voice, ...voices])
            if (defaultVoiceSet === true) {
                setDefaultVoiceOverride(avatarId, voice.id)
            } else if (avatarId && setAsDefault) {
                setWarning("Voice cloned, but it could not be set as the avatar's main voice.")
            }
            setName('')
            setAudioFile(null)
            if (fileInputRef.current) fileInputRef.current.value = ''
        } catch (err) {
            console.error('Clone failed:', err)
        } finally {
            setIsCloning(false)
        }
    }

    return (
        <Card>
            <div className="p-4 flex flex-col gap-3">
                <h3 className="font-semibold text-lg">Clone Your Voice</h3>
                <p className="text-sm text-gray-500">
                    Upload 10s-5min of clear audio. MiniMax will clone your voice with 99%+ accuracy.
                </p>

                <Input
                    placeholder="Voice name (e.g. 'Mi voz profesional')"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />

                <select
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                >
                    <option value="es">Español</option>
                    <option value="en">English</option>
                    <option value="pt">Português</option>
                    <option value="fr">Français</option>
                </select>

                <select
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    value={avatarId}
                    onChange={(e) => setAvatarId(e.target.value)}
                >
                    <option value="">No avatar (voice only)</option>
                    {avatars.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                </select>

                {avatarId && (
                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={setAsDefault}
                            onChange={(e) => setSetAsDefault(e.target.checked)}
                        />
                        Use as the avatar&apos;s main voice
                    </label>
                )}

                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".mp3,.m4a,.wav"
                    onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
                    className="text-sm"
                />

                {audioFile && (
                    <p className="text-xs text-gray-400">
                        {audioFile.name} ({(audioFile.size / 1024 / 1024).toFixed(1)} MB)
                    </p>
                )}

                <Button
                    onClick={handleClone}
                    loading={isCloning}
                    disabled={!audioFile || !name || isCloning}
                    variant="solid"
                    block
                >
                    {isCloning ? 'Cloning voice...' : 'Clone Voice'}
                </Button>

                {warning && <p className="text-xs text-amber-500">{warning}</p>}
            </div>
        </Card>
    )
}
