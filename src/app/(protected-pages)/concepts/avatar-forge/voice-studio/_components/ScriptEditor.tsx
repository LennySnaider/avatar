'use client'

import { useEffect, useState } from 'react'
import { useVoiceStudioStore } from '../_store/voiceStudioStore'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import type { AudioScript, ScriptTemplate, ScriptTone } from '@/@types/voice'

const TEMPLATES: { value: ScriptTemplate; label: string }[] = [
    { value: 'property-tour', label: 'Property Tour' },
    { value: 'product-review', label: 'Product Review' },
    { value: 'ugc-ad', label: 'UGC Ad' },
    { value: 'greeting', label: 'Greeting' },
    { value: 'tutorial', label: 'Tutorial' },
    { value: 'custom', label: 'Custom' },
]

const TONES: { value: ScriptTone; label: string }[] = [
    { value: 'professional', label: 'Professional' },
    { value: 'casual', label: 'Casual' },
    { value: 'funny', label: 'Funny' },
    { value: 'persuasive', label: 'Persuasive' },
]

const DURATIONS = [15, 30, 45, 60, 90]

export default function ScriptEditor() {
    const {
        currentScript, setCurrentScript,
        currentTitle, setCurrentTitle,
        scriptTone, setScriptTone,
        scriptTemplate, setScriptTemplate,
        scriptLanguage, setScriptLanguage,
        durationTarget, setDurationTarget,
        isGeneratingScript, setIsGeneratingScript,
        scripts, setScripts,
    } = useVoiceStudioStore()

    // ── Librería de guiones (tabla audio_scripts) ──────────────────────
    const [isSavingScript, setIsSavingScript] = useState(false)
    const [showLibrary, setShowLibrary] = useState(false)

    useEffect(() => {
        async function loadScripts() {
            const res = await fetch('/api/script/library')
            if (res.ok) {
                const { scripts: saved } = await res.json()
                setScripts(saved ?? [])
            }
        }
        loadScripts()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleSaveScript = async () => {
        if (!currentScript.trim()) return
        setIsSavingScript(true)
        try {
            const res = await fetch('/api/script/library', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: currentTitle,
                    script_text: currentScript,
                    language: scriptLanguage,
                    tone: scriptTone,
                    template_type: scriptTemplate,
                    duration_target_seconds: durationTarget,
                }),
            })
            if (res.ok) {
                const { script } = await res.json()
                setScripts([script, ...scripts])
                setShowLibrary(true)
            }
        } catch (err) {
            console.error('Failed to save script:', err)
        } finally {
            setIsSavingScript(false)
        }
    }

    const handleLoadScript = (s: AudioScript) => {
        setCurrentScript(s.script_text)
        setCurrentTitle(s.title)
        setScriptLanguage(s.language)
        setScriptTone(s.tone)
        setScriptTemplate(s.template_type)
        setDurationTarget(s.duration_target_seconds)
    }

    const handleDeleteScript = async (id: string) => {
        const res = await fetch('/api/script/library', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
        })
        if (res.ok) setScripts(scripts.filter((s) => s.id !== id))
    }

    const handleGenerate = async () => {
        setIsGeneratingScript(true)
        try {
            const res = await fetch('/api/script/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    template: scriptTemplate,
                    tone: scriptTone,
                    language: scriptLanguage,
                    durationSeconds: durationTarget,
                    context: {},
                    title: currentTitle || `${scriptTemplate} script`,
                    save: true,
                }),
            })

            if (!res.ok) {
                const { error } = await res.json().catch(() => ({ error: null }))
                throw new Error(error || 'Generation failed')
            }
            const { script } = await res.json()
            setCurrentScript(script)
        } catch (err) {
            console.error('Script generation failed:', err)
        } finally {
            setIsGeneratingScript(false)
        }
    }

    const wordCount = currentScript.split(/\s+/).filter(Boolean).length
    const estimatedSeconds = Math.round(wordCount / (scriptLanguage === 'es' ? 2.5 : 3.0))

    return (
        <Card>
            <div className="p-4 flex flex-col gap-3">
                <h3 className="font-semibold text-lg">Script Editor</h3>

                <Input
                    placeholder="Script title"
                    value={currentTitle}
                    onChange={(e) => setCurrentTitle(e.target.value)}
                />

                <div className="grid grid-cols-2 gap-2">
                    <select
                        className="rounded-md border px-3 py-2 text-sm"
                        value={scriptTemplate}
                        onChange={(e) => setScriptTemplate(e.target.value as ScriptTemplate)}
                    >
                        {TEMPLATES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                    </select>

                    <select
                        className="rounded-md border px-3 py-2 text-sm"
                        value={scriptTone}
                        onChange={(e) => setScriptTone(e.target.value as ScriptTone)}
                    >
                        {TONES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                    </select>

                    <select
                        className="rounded-md border px-3 py-2 text-sm"
                        value={scriptLanguage}
                        onChange={(e) => setScriptLanguage(e.target.value)}
                    >
                        <option value="es">Español</option>
                        <option value="en">English</option>
                        <option value="pt">Português</option>
                    </select>

                    <select
                        className="rounded-md border px-3 py-2 text-sm"
                        value={durationTarget}
                        onChange={(e) => setDurationTarget(Number(e.target.value))}
                    >
                        {DURATIONS.map((d) => (
                            <option key={d} value={d}>{d}s</option>
                        ))}
                    </select>
                </div>

                <Button
                    onClick={handleGenerate}
                    loading={isGeneratingScript}
                    disabled={isGeneratingScript}
                    variant="solid"
                    block
                >
                    {isGeneratingScript ? 'Generating...' : 'Generate Script with AI'}
                </Button>

                <textarea
                    className="w-full min-h-[200px] rounded-md border p-3 text-sm resize-y"
                    placeholder="Write your script here or generate one with AI..."
                    value={currentScript}
                    onChange={(e) => setCurrentScript(e.target.value)}
                />

                <div className="flex justify-between text-xs text-gray-500">
                    <span>{wordCount} words</span>
                    <span>~{estimatedSeconds}s estimated</span>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        variant="default"
                        loading={isSavingScript}
                        disabled={!currentScript.trim()}
                        onClick={handleSaveScript}
                    >
                        Save Script
                    </Button>
                    <Button
                        size="sm"
                        variant="plain"
                        onClick={() => setShowLibrary(!showLibrary)}
                    >
                        My Scripts ({scripts.length}) {showLibrary ? '▾' : '▸'}
                    </Button>
                </div>

                {showLibrary && scripts.length > 0 && (
                    <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                        {scripts.map((s) => (
                            <div
                                key={s.id}
                                className="flex items-center justify-between gap-2 p-2 rounded-md bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                                onClick={() => handleLoadScript(s)}
                                title={s.script_text}
                            >
                                <div className="flex flex-col min-w-0">
                                    <span className="text-sm font-medium truncate">{s.title}</span>
                                    <span className="text-[10px] text-gray-500 truncate">
                                        {s.language.toUpperCase()} · {s.tone} · {s.script_text.slice(0, 60)}…
                                    </span>
                                </div>
                                <Button
                                    size="xs"
                                    variant="plain"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        handleDeleteScript(s.id)
                                    }}
                                >
                                    ✕
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
                {showLibrary && scripts.length === 0 && (
                    <p className="text-xs text-gray-500">No saved scripts yet.</p>
                )}
            </div>
        </Card>
    )
}
