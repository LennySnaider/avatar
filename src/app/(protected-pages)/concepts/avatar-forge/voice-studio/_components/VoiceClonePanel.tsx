'use client'

import { useEffect, useState } from 'react'
import { useVoiceStudioStore, refreshVoices } from '../_store/voiceStudioStore'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Card from '@/components/ui/Card'
import Select from '@/components/ui/Select'
import Checkbox from '@/components/ui/Checkbox'
import Upload from '@/components/ui/Upload'
import Alert from '@/components/ui/Alert'
import { HiOutlineMicrophone } from 'react-icons/hi'
import type { Avatar } from '@/@types/supabase'

interface VoiceClonePanelProps {
    avatars: Avatar[]
}

type Option = { value: string; label: string }

const LANGUAGES: Option[] = [
    { value: 'es', label: 'Español' },
    { value: 'en', label: 'English' },
    { value: 'pt', label: 'Português' },
    { value: 'fr', label: 'Français' },
]

/** Límites de MiniMax para la muestra. Se comprueban ANTES de subir: rebotar
 * aquí es instantáneo, y rebotar allí cuesta la subida entera. */
const MAX_MB = 20
const MIN_SECONDS = 10
const MAX_SECONDS = 300

const formatDuration = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

export default function VoiceClonePanel({ avatars }: VoiceClonePanelProps) {
    const { setIsCloning, isCloning } = useVoiceStudioStore()
    const [name, setName] = useState('')
    const [language, setLanguage] = useState('es')
    const [audioFile, setAudioFile] = useState<File | null>(null)
    const [avatarId, setAvatarId] = useState('')
    const [setAsDefault, setSetAsDefault] = useState(true)
    const [warning, setWarning] = useState<string | null>(null)

    // Preview local: el objeto URL apunta al fichero en memoria, así que se
    // oye sin subir nada. Revocarlo en la limpieza no es cosmética — sin eso
    // el blob queda retenido en cada cambio de fichero.
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [duration, setDuration] = useState<number | null>(null)

    useEffect(() => {
        if (!audioFile) {
            setPreviewUrl(null)
            setDuration(null)
            return
        }
        const url = URL.createObjectURL(audioFile)
        setPreviewUrl(url)
        setDuration(null)
        return () => URL.revokeObjectURL(url)
    }, [audioFile])

    const avatarOptions: Option[] = [
        { value: '', label: 'No avatar (voice only)' },
        ...avatars.map((a) => ({ value: a.id, label: a.name })),
    ]

    const beforeUpload = (files: FileList | null) => {
        const file = files?.[0]
        if (!file) return true
        if (!/\.(mp3|m4a|wav)$/i.test(file.name)) {
            return 'Audio must be an mp3, m4a or wav file'
        }
        if (file.size > MAX_MB * 1024 * 1024) {
            return `Audio is too large (max ${MAX_MB} MB)`
        }
        return true
    }

    // La duración solo se conoce al decodificar la cabecera, o sea después de
    // elegir. Algunos mp3 con bitrate variable reportan Infinity hasta que se
    // busca dentro, así que solo se juzga lo que sea un número real.
    const durationIssue =
        duration !== null && Number.isFinite(duration)
            ? duration < MIN_SECONDS
                ? `Too short — MiniMax needs at least ${MIN_SECONDS}s`
                : duration > MAX_SECONDS
                  ? 'Too long — MiniMax accepts up to 5 min'
                  : null
            : null

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

            const { defaultVoiceSet } = await res.json()
            // Fuente de verdad viva: recarga voces + mapeo avatar↔default.
            await refreshVoices()
            if (avatarId && setAsDefault && defaultVoiceSet !== true) {
                setWarning("Voice cloned, but it could not be set as the avatar's main voice.")
            }
            setName('')
            setAudioFile(null)
        } catch (err) {
            console.error('Clone failed:', err)
            setWarning(err instanceof Error ? err.message : 'Voice cloning failed')
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

                <Select<Option>
                    instanceId="voice-clone-language"
                    options={LANGUAGES}
                    value={LANGUAGES.find((o) => o.value === language)}
                    onChange={(option) => setLanguage(option?.value ?? 'es')}
                />

                <Select<Option>
                    instanceId="voice-clone-avatar"
                    options={avatarOptions}
                    value={avatarOptions.find((o) => o.value === avatarId)}
                    onChange={(option) => setAvatarId(option?.value ?? '')}
                />

                {avatarId && (
                    <Checkbox checked={setAsDefault} onChange={setSetAsDefault}>
                        Use as the avatar&apos;s main voice
                    </Checkbox>
                )}

                <Upload
                    draggable
                    accept=".mp3,.m4a,.wav"
                    uploadLimit={1}
                    fileList={audioFile ? [audioFile] : []}
                    beforeUpload={beforeUpload}
                    tip={`mp3, m4a or wav · ${MIN_SECONDS}s-5min · max ${MAX_MB} MB`}
                    onChange={(files) => setAudioFile(files[files.length - 1] ?? null)}
                    onFileRemove={() => setAudioFile(null)}
                />

                {previewUrl && (
                    <div className="flex flex-col gap-1">
                        {/* Escuchar la muestra ANTES de clonar: es la única
                            forma de cazar un audio cortado o con ruido sin
                            gastar el clon, que se cobra por voz. */}
                        <audio
                            controls
                            src={previewUrl}
                            className="w-full"
                            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                        />
                        <p className="text-xs text-gray-400">
                            {audioFile?.name}
                            {duration !== null && Number.isFinite(duration) &&
                                ` · ${formatDuration(duration)}`}
                        </p>
                    </div>
                )}

                {durationIssue && (
                    <Alert type="warning" showIcon>
                        {durationIssue}
                    </Alert>
                )}

                <Button
                    icon={<HiOutlineMicrophone />}
                    onClick={handleClone}
                    loading={isCloning}
                    disabled={!audioFile || !name || isCloning}
                    variant="solid"
                    block
                >
                    <span>{isCloning ? 'Cloning voice...' : 'Clone Voice'}</span>
                </Button>

                {warning && (
                    <Alert type="danger" showIcon>
                        {warning}
                    </Alert>
                )}
            </div>
        </Card>
    )
}
