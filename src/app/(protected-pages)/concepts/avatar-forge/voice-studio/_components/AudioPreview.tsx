'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useVoiceStudioStore } from '../_store/voiceStudioStore'
import { useAvatarStudioStore } from '../../avatar-studio/_store/avatarStudioStore'
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
    { value: 'neutral', label: 'Neutral' },
] as const

interface AudioPreviewProps {
    /** Provided when hosted inside Avatar Studio's ToolModal: hands control
     * back to the studio (closes the modal) instead of navigating, which
     * would remount the studio and wipe its in-memory gallery. */
    onSentToAvatarStudio?: (avatarId: string | null) => void
}

export default function AudioPreview({ onSentToAvatarStudio }: AudioPreviewProps = {}) {
    const {
        currentScript, selectedVoiceId, voices, setVoices,
        previewAudioUrl, setPreviewAudioUrl,
        isGeneratingAudio, setIsGeneratingAudio,
        scriptLanguage, settingsEditNonce,
    } = useVoiceStudioStore()
    const audioRef = useRef<HTMLAudioElement>(null)
    const router = useRouter()

    const selectedVoice = voices.find((v) => v.id === selectedVoiceId)

    // Lleva el audio generado + guion directo al modo Speak del Avatar Studio
    // (navegación client-side: los stores sobreviven, no se re-genera nada).
    const handleSendToAvatarStudio = () => {
        if (!previewAudioUrl) return
        const avatarStudio = useAvatarStudioStore.getState()
        avatarStudio.setSpeakAudioUrl(previewAudioUrl)
        avatarStudio.setVideoDialogue(currentScript.trim())
        avatarStudio.setGenerationMode('VIDEO')
        avatarStudio.setVideoSubMode('SPEAK')
        const avatarId = selectedVoice?.avatar_id
        if (onSentToAvatarStudio) {
            onSentToAvatarStudio(avatarId ?? null)
            return
        }
        router.push(`/concepts/avatar-forge/avatar-studio${avatarId ? `?avatarId=${avatarId}` : ''}`)
    }

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

    // Carga los ajustes guardados de la voz en los sliders — al seleccionar
    // otra voz o al pulsar "Edit" en Your Voices (settingsEditNonce).
    useEffect(() => {
        const s = selectedVoice?.tts_settings
        setSpeed(s?.speed ?? 1)
        setPitch(s?.pitch ?? 0)
        setEmotion(s?.emotion ?? '')
        setAutoAccent(s?.useAutoAccent ?? false)
        setSettingsMsg(null)
    }, [selectedVoiceId, settingsEditNonce]) // eslint-disable-line react-hooks/exhaustive-deps

    // Preview de velocidad en tiempo real sobre el audio ya generado, sin
    // alterar el tono (preservesPitch). Pitch/emotion sí requieren regenerar:
    // el navegador no puede cambiar tono sin cambiar también la velocidad.
    useEffect(() => {
        const el = audioRef.current
        if (!el) return
        el.preservesPitch = true
        el.playbackRate = Math.min(4, Math.max(0.25, speed / bakedSpeed))
    }, [speed, bakedSpeed, previewAudioUrl])

    // ── EQ en vivo (graves/agudos) vía Web Audio ────────────────────────
    // lowshelf 200Hz = Bass, highshelf 3kHz = Treble. Solo afecta la
    // REPRODUCCIÓN; "Apply EQ to file" lo hornea al archivo para que
    // lipsync/Speak usen lo mismo que se escucha.
    const [bass, setBass] = useState(0)
    const [treble, setTreble] = useState(0)
    const [isApplyingEq, setIsApplyingEq] = useState(false)
    const [eqError, setEqError] = useState<string | null>(null)
    const audioCtxRef = useRef<AudioContext | null>(null)
    const bassNodeRef = useRef<BiquadFilterNode | null>(null)
    const trebleNodeRef = useRef<BiquadFilterNode | null>(null)
    // Elemento al que está conectado el grafo: si React/HMR recrea el <audio>,
    // hay que reconstruir (un MediaElementSource ligado a un nodo desmontado
    // reproduce por el camino normal y el EQ "no hace nada").
    const boundElRef = useRef<HTMLAudioElement | null>(null)

    const ensureEqGraph = () => {
        const el = audioRef.current
        if (!el) return
        if (audioCtxRef.current && boundElRef.current === el) {
            // Autoplay policy puede dejar el contexto suspendido.
            if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume()
            return
        }
        try {
            // Elemento nuevo → desechar el grafo viejo.
            audioCtxRef.current?.close().catch(() => {})
            const ctx = new AudioContext()
            const source = ctx.createMediaElementSource(el)
            const bassNode = ctx.createBiquadFilter()
            bassNode.type = 'lowshelf'
            bassNode.frequency.value = 200
            bassNode.gain.value = bass
            const trebleNode = ctx.createBiquadFilter()
            trebleNode.type = 'highshelf'
            trebleNode.frequency.value = 3000
            trebleNode.gain.value = treble
            source.connect(bassNode).connect(trebleNode).connect(ctx.destination)
            if (ctx.state === 'suspended') ctx.resume()
            audioCtxRef.current = ctx
            bassNodeRef.current = bassNode
            trebleNodeRef.current = trebleNode
            boundElRef.current = el
            setEqError(null)
        } catch (err) {
            console.error('[AudioPreview] EQ graph failed:', err)
            setEqError('Live EQ unavailable in this session — "Apply EQ to file" still works.')
        }
    }

    useEffect(() => {
        // El drag del slider es gesto de usuario válido para crear el contexto.
        ensureEqGraph()
        if (bassNodeRef.current) bassNodeRef.current.gain.value = bass
        if (trebleNodeRef.current) trebleNodeRef.current.gain.value = treble
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bass, treble])

    /** Codifica un AudioBuffer a WAV PCM16 (el navegador no trae encoder mp3). */
    const audioBufferToWav = (buf: AudioBuffer): Blob => {
        const numCh = buf.numberOfChannels
        const len = buf.length * numCh * 2
        const out = new DataView(new ArrayBuffer(44 + len))
        const writeStr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)) }
        writeStr(0, 'RIFF'); out.setUint32(4, 36 + len, true); writeStr(8, 'WAVE')
        writeStr(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true)
        out.setUint16(22, numCh, true); out.setUint32(24, buf.sampleRate, true)
        out.setUint32(28, buf.sampleRate * numCh * 2, true); out.setUint16(32, numCh * 2, true)
        out.setUint16(34, 16, true); writeStr(36, 'data'); out.setUint32(40, len, true)
        let offset = 44
        for (let i = 0; i < buf.length; i++) {
            for (let ch = 0; ch < numCh; ch++) {
                const s = Math.max(-1, Math.min(1, buf.getChannelData(ch)[i]))
                out.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
                offset += 2
            }
        }
        return new Blob([out.buffer], { type: 'audio/wav' })
    }

    // Re-procesa el mp3 con los mismos filtros (OfflineAudioContext), sube el
    // WAV resultante y reemplaza previewAudioUrl — el EQ queda horneado.
    const handleApplyEq = async () => {
        if (!previewAudioUrl || (bass === 0 && treble === 0)) return
        setIsApplyingEq(true)
        try {
            const raw = await (await fetch(previewAudioUrl)).arrayBuffer()
            const decodeCtx = new AudioContext()
            const decoded = await decodeCtx.decodeAudioData(raw)
            decodeCtx.close()

            const offline = new OfflineAudioContext(decoded.numberOfChannels, decoded.length, decoded.sampleRate)
            const src = offline.createBufferSource()
            src.buffer = decoded
            const b = offline.createBiquadFilter()
            b.type = 'lowshelf'; b.frequency.value = 200; b.gain.value = bass
            const t = offline.createBiquadFilter()
            t.type = 'highshelf'; t.frequency.value = 3000; t.gain.value = treble
            src.connect(b).connect(t).connect(offline.destination)
            src.start()
            const rendered = await offline.startRendering()

            const wav = audioBufferToWav(rendered)
            const form = new FormData()
            form.append('audio', new File([wav], 'eq.wav', { type: 'audio/wav' }))
            const res = await fetch('/api/voice/upload-audio', { method: 'POST', body: form })
            if (!res.ok) {
                const { error } = await res.json()
                throw new Error(error || 'Upload failed')
            }
            const { audioUrl } = await res.json()
            setPreviewAudioUrl(audioUrl)
            // El archivo YA suena así — las perillas vuelven a plano.
            setBass(0)
            setTreble(0)
        } catch (err) {
            console.error('Apply EQ failed:', err)
            setSettingsMsg('Could not apply EQ to the file.')
        } finally {
            setIsApplyingEq(false)
        }
    }

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
            // Regenerar el preview cacheado (▶ en Your Voices) para que refleje
            // la nueva entrega — si falla no bloquea el guardado.
            let refreshedPreviewUrl: string | null = null
            try {
                const prevRes = await fetch('/api/voice/preview', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ voiceId: selectedVoice.id, force: true }),
                })
                if (prevRes.ok) {
                    const { previewUrl } = await prevRes.json()
                    refreshedPreviewUrl = previewUrl
                }
            } catch (previewErr) {
                console.error('Failed to refresh voice preview:', previewErr)
            }

            // Reflejar en el store para que esta UI (y quien recargue voces) lo vea.
            setVoices(voices.map((v) => (v.id === selectedVoice.id
                ? { ...v, tts_settings: settings, preview_audio_url: refreshedPreviewUrl ?? v.preview_audio_url }
                : v)))
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
                        <label className="flex items-center justify-between gap-2">
                            <span className="text-gray-500 w-14">Accent</span>
                            <select
                                className="flex-1 rounded-md border px-2 py-1 text-sm bg-white dark:bg-gray-800"
                                value={autoAccent ? 'clone' : 'neutral'}
                                onChange={(e) => setAutoAccent(e.target.value === 'clone')}
                            >
                                {/* MiniMax no soporta acentos regionales explícitos
                                    (es-MX → 2013): las únicas palancas reales son el
                                    acento de la muestra clonada o el neutro. */}
                                <option value="clone">Clone&apos;s accent (e.g. Mexican) — from your sample</option>
                                <option value="neutral">Neutral Spanish (generic)</option>
                            </select>
                        </label>
                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-gray-500 w-14">Presets</span>
                            <button
                                type="button"
                                onClick={() => {
                                    // "Seductive" no existe en el enum de MiniMax
                                    // (verificado: 2013 invalid params) — se aproxima
                                    // con entrega: lenta, grave y calmada.
                                    setSpeed(0.9)
                                    setPitch(-2)
                                    setEmotion('calm')
                                }}
                                className="px-2 py-1 text-xs rounded bg-purple-500/10 text-purple-500 hover:bg-purple-500/20 transition-colors"
                            >
                                Seductive ✨
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setSpeed(1)
                                    setPitch(0)
                                    setEmotion('')
                                }}
                                className="px-2 py-1 text-xs rounded bg-gray-500/10 text-gray-500 hover:bg-gray-500/20 transition-colors"
                            >
                                Reset
                            </button>
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
                    <>
                        <audio
                            ref={audioRef}
                            controls
                            crossOrigin="anonymous"
                            src={previewAudioUrl}
                            className="w-full"
                            onPlay={ensureEqGraph}
                        />
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
                                <span className="w-12 text-right tabular-nums">{speed.toFixed(2)}x</span>
                            </label>
                            <label className="flex items-center justify-between gap-2">
                                <span className="text-gray-500 w-14">
                                    Bass <span className="text-[9px] text-emerald-500 block leading-tight">live</span>
                                </span>
                                <input
                                    type="range"
                                    min={-12}
                                    max={12}
                                    step={1}
                                    value={bass}
                                    onChange={(e) => setBass(Number(e.target.value))}
                                    className="flex-1 accent-primary"
                                />
                                <span className="w-12 text-right tabular-nums">{bass > 0 ? `+${bass}` : bass} dB</span>
                            </label>
                            <label className="flex items-center justify-between gap-2">
                                <span className="text-gray-500 w-14">
                                    Treble <span className="text-[9px] text-emerald-500 block leading-tight">live</span>
                                </span>
                                <input
                                    type="range"
                                    min={-12}
                                    max={12}
                                    step={1}
                                    value={treble}
                                    onChange={(e) => setTreble(Number(e.target.value))}
                                    className="flex-1 accent-primary"
                                />
                                <span className="w-12 text-right tabular-nums">{treble > 0 ? `+${treble}` : treble} dB</span>
                            </label>
                            <div className="flex items-center gap-2">
                                <Button
                                    size="sm"
                                    variant="default"
                                    loading={isSavingSettings}
                                    onClick={handleSaveSettings}
                                >
                                    Save Voice Default
                                </Button>
                                {(bass !== 0 || treble !== 0) && (
                                    <Button
                                        size="sm"
                                        variant="default"
                                        loading={isApplyingEq}
                                        onClick={handleApplyEq}
                                    >
                                        Apply EQ to file
                                    </Button>
                                )}
                                {settingsMsg && (
                                    <span className={`text-xs ${settingsMsg.startsWith('Saved') ? 'text-emerald-500' : 'text-amber-500'}`}>
                                        {settingsMsg}
                                    </span>
                                )}
                            </div>
                            {eqError && <p className="text-[10px] text-amber-500">{eqError}</p>}
                            <p className="text-[10px] text-gray-400 -mt-1">
                                Bass/Treble preview live while playing. &quot;Apply EQ to file&quot; bakes
                                them into the audio so Lipsync and Speak use exactly what you hear.
                            </p>
                        </div>
                        <Button variant="default" block onClick={handleSendToAvatarStudio}>
                            🎬 Send to Avatar Studio
                        </Button>
                        <p className="text-[10px] text-gray-400 text-center -mt-1">
                            Opens Speak mode{selectedVoice?.avatar_id ? ' with the linked avatar' : ''} using THIS audio — no TTS re-generation.
                        </p>
                    </>
                )}
            </div>
        </Card>
    )
}
