'use client'

import { useEffect, useRef, useState } from 'react'
import { useVoiceStudioStore } from '../_store/voiceStudioStore'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import type { VoiceTtsSettings } from '@/@types/voice'

const EMOTIONS = [
    { value: '', label: 'Auto' },
    { value: 'happy', label: 'Happy' },
    { value: 'calm', label: 'Calm' },
    { value: 'sad', label: 'Sad' },
    { value: 'angry', label: 'Angry' },
    { value: 'fearful', label: 'Fearful' },
    { value: 'disgusted', label: 'Disgusted' },
    { value: 'surprised', label: 'Surprised' },
] as const

export default function AudioPreview() {
    const {
        currentScript, selectedVoiceId, voices, setVoices,
        previewAudioUrl, setPreviewAudioUrl,
        isGeneratingAudio, setIsGeneratingAudio,
        scriptLanguage,
    } = useVoiceStudioStore()
    const audioRef = useRef<HTMLAudioElement>(null)

    const selectedVoice = voices.find((v) => v.id === selectedVoiceId)

    // Ajustes de entrega (speed/pitch/emotion) — precargados desde la voz.
    const [speed, setSpeed] = useState(1)
    const [pitch, setPitch] = useState(0)
    const [emotion, setEmotion] = useState('')
    const [autoAccent, setAutoAccent] = useState(false)
    const [isSavingSettings, setIsSavingSettings] = useState(false)
    const [settingsMsg, setSettingsMsg] = useState<string | null>(null)
    // Speed que quedó HORNEADA en el último audio generado — el preview en
    // vivo reproduce a (deseada / horneada) para simular el resultado final.
    const [bakedSpeed, setBakedSpeed] = useState(1)

    useEffect(() => {
        const s = selectedVoice?.tts_settings
        setSpeed(s?.speed ?? 1)
        setPitch(s?.pitch ?? 0)
        setEmotion(s?.emotion ?? '')
        setAutoAccent(s?.useAutoAccent ?? false)
        setSettingsMsg(null)
    }, [selectedVoiceId]) // eslint-disable-line react-hooks/exhaustive-deps

    // Preview de velocidad en tiempo real sobre el audio ya generado, sin
    // alterar el tono (preservesPitch). Pitch/emotion sí requieren regenerar:
    // el navegador no puede cambiar tono sin cambiar también la velocidad.
    useEffect(() => {
        const el = audioRef.current
        if (!el) return
        el.preservesPitch = true
        el.playbackRate = Math.min(4, Math.max(0.25, speed / bakedSpeed))
    }, [speed, bakedSpeed, previewAudioUrl])

    const buildSettings = (): VoiceTtsSettings => {
        const s: VoiceTtsSettings = {}
        if (speed !== 1) s.speed = speed
        if (pitch !== 0) s.pitch = pitch
        if (emotion) s.emotion = emotion as VoiceTtsSettings['emotion']
        if (autoAccent) s.useAutoAccent = true
        return s
    }

    const handleGenerateAudio = async () => {
        if (!currentScript || !selectedVoice) return

        setIsGeneratingAudio(true)
        try {
            const res = await fetch('/api/voice/tts-file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: currentScript,
                    voiceId: selectedVoice.provider_voice_id,
                    // 'auto' deja que el acento de la muestra clonada mande
                    // (MiniMax no acepta variantes regionales explícitas).
                    language: autoAccent
                        ? 'auto'
                        : scriptLanguage === 'es' ? 'Spanish' : scriptLanguage === 'en' ? 'English' : scriptLanguage,
                    ...buildSettings(),
                }),
            })

            if (!res.ok) {
                const { error } = await res.json()
                throw new Error(error || 'TTS failed')
            }
            const { audioUrl } = await res.json()
            setPreviewAudioUrl(audioUrl)
            setBakedSpeed(speed)
        } catch (err) {
            console.error('TTS generation failed:', err)
        } finally {
            setIsGeneratingAudio(false)
        }
    }

    const handleSaveSettings = async () => {
        if (!selectedVoice) return
        setIsSavingSettings(true)
        setSettingsMsg(null)
        try {
            const settings = buildSettings()
            const res = await fetch('/api/voice/update-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ voiceId: selectedVoice.id, settings }),
            })
            if (!res.ok) {
                const { error } = await res.json()
                throw new Error(error || 'Save failed')
            }
            // Reflejar en el store para que esta UI (y quien recargue voces) lo vea.
            setVoices(voices.map((v) => (v.id === selectedVoice.id ? { ...v, tts_settings: settings } : v)))
            setSettingsMsg('Saved as this voice’s default delivery.')
        } catch (err) {
            console.error('Failed to save voice settings:', err)
            setSettingsMsg('Could not save settings.')
        } finally {
            setIsSavingSettings(false)
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

                {selectedVoice && (
                    <div className="flex flex-col gap-2 text-sm">
                        <label className="flex items-center justify-between gap-2">
                            <span className="text-gray-500 w-14">
                                Speed <span className="text-[9px] text-emerald-500 block leading-tight">live</span>
                            </span>
                            <input
                                type="range"
                                min={0.5}
                                max={2}
                                step={0.05}
                                value={speed}
                                onChange={(e) => setSpeed(Number(e.target.value))}
                                className="flex-1 accent-primary"
                            />
                            <span className="w-10 text-right tabular-nums">{speed.toFixed(2)}x</span>
                        </label>
                        <label className="flex items-center justify-between gap-2">
                            <span className="text-gray-500 w-14">Pitch</span>
                            <input
                                type="range"
                                min={-12}
                                max={12}
                                step={1}
                                value={pitch}
                                onChange={(e) => setPitch(Number(e.target.value))}
                                className="flex-1 accent-primary"
                            />
                            <span className="w-10 text-right tabular-nums">{pitch > 0 ? `+${pitch}` : pitch}</span>
                        </label>
                        <label className="flex items-center justify-between gap-2">
                            <span className="text-gray-500 w-14">Emotion</span>
                            <select
                                className="flex-1 rounded-md border px-2 py-1 text-sm bg-white dark:bg-gray-800"
                                value={emotion}
                                onChange={(e) => setEmotion(e.target.value)}
                            >
                                {EMOTIONS.map((e) => (
                                    <option key={e.value} value={e.value}>{e.label}</option>
                                ))}
                            </select>
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={autoAccent}
                                onChange={(e) => setAutoAccent(e.target.checked)}
                            />
                            <span>
                                Auto accent
                                <span className="text-xs text-gray-400 block">
                                    Let the cloned sample&apos;s accent lead (e.g. Mexican) instead of generic Spanish.
                                </span>
                            </span>
                        </label>
                        <div className="flex items-center gap-2">
                            <Button
                                size="xs"
                                variant="plain"
                                loading={isSavingSettings}
                                onClick={handleSaveSettings}
                            >
                                Save as voice default
                            </Button>
                            {settingsMsg && (
                                <span className={`text-xs ${settingsMsg.startsWith('Saved') ? 'text-emerald-500' : 'text-amber-500'}`}>
                                    {settingsMsg}
                                </span>
                            )}
                        </div>
                        <p className="text-[10px] text-gray-400">
                            Speed previews live on the player below — no re-generation needed.
                            Pitch and Emotion apply on the next Generate Audio. Saved settings
                            are applied automatically in Avatar Studio&apos;s Speak mode.
                        </p>
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
