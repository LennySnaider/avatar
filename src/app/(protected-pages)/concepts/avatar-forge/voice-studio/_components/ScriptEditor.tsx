'use client'

import { useVoiceStudioStore } from '../_store/voiceStudioStore'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import type { ScriptTemplate, ScriptTone } from '@/@types/voice'

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
    } = useVoiceStudioStore()

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

            if (!res.ok) throw new Error('Generation failed')
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
            </div>
        </Card>
    )
}
