'use client'

import { useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Switcher from '@/components/ui/Switcher'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { HiOutlineSparkles } from 'react-icons/hi'
import {
    generatePersonaFromAvatar,
    testPersonaProvider,
    upsertAvatarPersona,
} from '@/services/AgentService'
import {
    AGENT_MODEL_PRESETS,
    RESPONSE_LENGTHS,
    RESPONSE_OBJECTIVES,
    RESPONSE_TONES,
    type ChatProviderSlug,
    type NsfwLevel,
    type PersonaDTO,
    type ResponseLength,
    type ResponseObjective,
    type ResponseTone,
} from '@/lib/agent/types'

interface PersonaEditorProps {
    avatarId: string
    avatarName: string
    persona: PersonaDTO | null
    onPersonaChange: (persona: PersonaDTO) => void
}

interface Option {
    value: string
    label: string
}

const PROVIDER_OPTIONS: Option[] = [
    { value: 'gemini', label: 'Gemini (Google)' },
    { value: 'openrouter', label: 'OpenRouter (multi-model, permissive options)' },
]

const toOptions = (values: string[]): Option[] =>
    values.map((v) => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }))

const TONE_OPTIONS = toOptions(RESPONSE_TONES)
const OBJECTIVE_OPTIONS = toOptions(RESPONSE_OBJECTIVES)
const LENGTH_OPTIONS = toOptions(RESPONSE_LENGTHS)
const NSFW_OPTIONS: Option[] = [
    { value: 'sfw', label: 'SFW — always safe' },
    { value: 'suggestive', label: 'Suggestive — tease, never explicit' },
    { value: 'explicit', label: 'Explicit — adult chat (needs a permissive model)' },
]

const PersonaEditor = ({ avatarId, avatarName, persona, onPersonaChange }: PersonaEditorProps) => {
    const [enabled, setEnabled] = useState(persona?.enabled ?? false)
    const [backstory, setBackstory] = useState(persona?.backstory ?? '')
    const [traits, setTraits] = useState((persona?.personality.traits ?? []).join(', '))
    const [interests, setInterests] = useState((persona?.personality.interests ?? []).join(', '))
    const [quirks, setQuirks] = useState((persona?.personality.quirks ?? []).join(', '))
    const [emojiUsage, setEmojiUsage] = useState(persona?.personality.emojiUsage ?? 'medium')
    const [writingStyle, setWritingStyle] = useState(persona?.writingStyle ?? '')
    const [boundaries, setBoundaries] = useState(persona?.boundaries ?? '')
    const [languages, setLanguages] = useState((persona?.languages ?? ['en']).join(', '))
    const [systemPrompt, setSystemPrompt] = useState(persona?.systemPrompt ?? '')
    const [provider, setProvider] = useState<ChatProviderSlug>(persona?.chatProvider ?? 'gemini')
    const [model, setModel] = useState(persona?.chatModel ?? 'gemini-2.5-flash')
    const [apiKeyInput, setApiKeyInput] = useState('')
    const [apiKeyDirty, setApiKeyDirty] = useState(false)
    const [tone, setTone] = useState<ResponseTone>(persona?.responseTone ?? 'flirty')
    const [objective, setObjective] = useState<ResponseObjective>(persona?.responseObjective ?? 'engagement')
    const [length, setLength] = useState<ResponseLength>(persona?.responseLength ?? 'medium')
    const [nsfw, setNsfw] = useState<NsfwLevel>(persona?.nsfwLevel ?? 'suggestive')

    const [isSaving, setIsSaving] = useState(false)
    const [isGenerating, setIsGenerating] = useState(false)
    const [isTesting, setIsTesting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const modelPresets = AGENT_MODEL_PRESETS[provider === 'openrouter' ? 'openrouter' : 'gemini']

    const splitCsv = (value: string) =>
        value
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)

    const applyPersona = (p: PersonaDTO) => {
        setEnabled(p.enabled)
        setBackstory(p.backstory ?? '')
        setTraits((p.personality.traits ?? []).join(', '))
        setInterests((p.personality.interests ?? []).join(', '))
        setQuirks((p.personality.quirks ?? []).join(', '))
        setEmojiUsage(p.personality.emojiUsage ?? 'medium')
        setWritingStyle(p.writingStyle ?? '')
        setBoundaries(p.boundaries ?? '')
        setLanguages(p.languages.join(', '))
        setSystemPrompt(p.systemPrompt ?? '')
        setProvider(p.chatProvider)
        setModel(p.chatModel)
        setTone(p.responseTone)
        setObjective(p.responseObjective)
        setLength(p.responseLength)
        setNsfw(p.nsfwLevel)
        onPersonaChange(p)
    }

    const handleProviderChange = (value: ChatProviderSlug) => {
        setProvider(value)
        const presets = AGENT_MODEL_PRESETS[value === 'openrouter' ? 'openrouter' : 'gemini']
        setModel(presets[0]?.value ?? '')
    }

    const handleSave = async () => {
        setIsSaving(true)
        setError(null)
        try {
            const result = await upsertAvatarPersona({
                avatarId,
                enabled,
                systemPrompt: systemPrompt.trim() || null,
                backstory: backstory.trim() || null,
                personality: {
                    traits: splitCsv(traits),
                    interests: splitCsv(interests),
                    quirks: splitCsv(quirks),
                    emojiUsage,
                },
                writingStyle: writingStyle.trim() || null,
                boundaries: boundaries.trim() || null,
                languages: splitCsv(languages),
                chatProvider: provider,
                chatModel: model.trim(),
                // undefined = keep the stored key; typed value ('' clears) otherwise
                apiKey: apiKeyDirty ? apiKeyInput : undefined,
                responseTone: tone,
                responseObjective: objective,
                responseLength: length,
                nsfwLevel: nsfw,
            })
            if (result.success && result.data) {
                applyPersona(result.data)
                setApiKeyInput('')
                setApiKeyDirty(false)
                toast.push(
                    <Notification type="success" title="Persona saved">
                        {avatarName}&apos;s agent persona was updated
                    </Notification>,
                )
            } else {
                setError(result.error ?? 'Failed to save persona')
            }
        } finally {
            setIsSaving(false)
        }
    }

    const handleGenerate = async () => {
        setIsGenerating(true)
        setError(null)
        try {
            const result = await generatePersonaFromAvatar(avatarId)
            if (result.success && result.data) {
                applyPersona(result.data)
                toast.push(
                    <Notification type="success" title="Persona drafted">
                        Review the generated persona, adjust and save
                    </Notification>,
                )
            } else {
                setError(result.error ?? 'Persona generation failed')
            }
        } finally {
            setIsGenerating(false)
        }
    }

    const handleTest = async () => {
        setIsTesting(true)
        setError(null)
        try {
            const result = await testPersonaProvider(avatarId)
            if (result.success && result.data) {
                toast.push(
                    <Notification type="success" title={`Provider OK (${result.data.latencyMs}ms)`}>
                        “{result.data.reply}”
                    </Notification>,
                )
            } else {
                toast.push(
                    <Notification type="danger" title="Provider test failed">
                        {result.error ?? 'Unknown error'}
                    </Notification>,
                )
            }
        } finally {
            setIsTesting(false)
        }
    }

    return (
        <div className="flex flex-col gap-4 max-w-4xl">
            {error && (
                <div className="p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg">
                    <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                </div>
            )}

            <Card>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <Switcher checked={enabled} onChange={(checked) => setEnabled(checked)} />
                        <div>
                            <p className="text-sm font-semibold">Agent enabled</p>
                            <p className="text-xs text-gray-400">
                                Gates channels (Fanvue inbox). The playground works either way.
                            </p>
                        </div>
                    </div>
                    <Button
                        variant="solid"
                        icon={<HiOutlineSparkles />}
                        loading={isGenerating}
                        onClick={handleGenerate}
                    >
                        {persona ? 'Regenerate from Avatar' : 'Generate from Avatar'}
                    </Button>
                </div>
            </Card>

            <Card>
                <p className="text-sm font-semibold mb-3">AI Provider</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <p className="text-xs text-gray-500 mb-1">Provider</p>
                        <Select<Option>
                            instanceId="agent-provider"
                            options={PROVIDER_OPTIONS}
                            value={PROVIDER_OPTIONS.find((o) => o.value === provider) ?? null}
                            onChange={(opt) => opt && handleProviderChange(opt.value as ChatProviderSlug)}
                        />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 mb-1">Model (pick or type a custom id)</p>
                        <Input
                            value={model}
                            onChange={(e) => setModel(e.target.value)}
                            placeholder="model id"
                        />
                        <div className="flex flex-wrap gap-1 mt-1">
                            {modelPresets.map((m) => (
                                <button
                                    key={m.value}
                                    type="button"
                                    onClick={() => setModel(m.value)}
                                    className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
                                        model === m.value
                                            ? 'bg-primary/15 text-primary border-primary/40'
                                            : 'text-gray-500 border-gray-200 dark:border-gray-600 hover:border-primary/40'
                                    }`}
                                >
                                    {m.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="sm:col-span-2">
                        <p className="text-xs text-gray-500 mb-1">API key for this avatar (optional)</p>
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="w-full sm:w-96">
                                <Input
                                    type="password"
                                    value={apiKeyInput}
                                    placeholder={
                                        persona?.hasApiKey
                                            ? 'Custom key saved — type to replace, save empty to clear'
                                            : 'Using environment key — type to set a custom one'
                                    }
                                    onChange={(e) => {
                                        setApiKeyInput(e.target.value)
                                        setApiKeyDirty(true)
                                    }}
                                />
                            </div>
                            <Button size="sm" loading={isTesting} onClick={handleTest}>
                                Test provider
                            </Button>
                        </div>
                    </div>
                </div>
            </Card>

            <Card>
                <p className="text-sm font-semibold mb-3">Response style</p>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                        <p className="text-xs text-gray-500 mb-1">Tone</p>
                        <Select<Option>
                            instanceId="agent-tone"
                            options={TONE_OPTIONS}
                            value={TONE_OPTIONS.find((o) => o.value === tone) ?? null}
                            onChange={(opt) => opt && setTone(opt.value as ResponseTone)}
                        />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 mb-1">Objective</p>
                        <Select<Option>
                            instanceId="agent-objective"
                            options={OBJECTIVE_OPTIONS}
                            value={OBJECTIVE_OPTIONS.find((o) => o.value === objective) ?? null}
                            onChange={(opt) => opt && setObjective(opt.value as ResponseObjective)}
                        />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 mb-1">Length</p>
                        <Select<Option>
                            instanceId="agent-length"
                            options={LENGTH_OPTIONS}
                            value={LENGTH_OPTIONS.find((o) => o.value === length) ?? null}
                            onChange={(opt) => opt && setLength(opt.value as ResponseLength)}
                        />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 mb-1">Content level</p>
                        <Select<Option>
                            instanceId="agent-nsfw"
                            options={NSFW_OPTIONS}
                            value={NSFW_OPTIONS.find((o) => o.value === nsfw) ?? null}
                            onChange={(opt) => opt && setNsfw(opt.value as NsfwLevel)}
                        />
                    </div>
                </div>
                {nsfw === 'explicit' && provider === 'gemini' && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                        Gemini&apos;s safety filters block explicit content — switch to OpenRouter
                        with a permissive model for this level.
                    </p>
                )}
            </Card>

            <Card>
                <p className="text-sm font-semibold mb-3">Persona</p>
                <div className="flex flex-col gap-3">
                    <div>
                        <p className="text-xs text-gray-500 mb-1">Backstory</p>
                        <Input
                            textArea
                            rows={4}
                            value={backstory}
                            onChange={(e) => setBackstory(e.target.value)}
                            placeholder="Who is she? City, job, daily life, how she got here..."
                        />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                            <p className="text-xs text-gray-500 mb-1">Traits (comma separated)</p>
                            <Input value={traits} onChange={(e) => setTraits(e.target.value)} placeholder="playful, curious..." />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 mb-1">Interests</p>
                            <Input value={interests} onChange={(e) => setInterests(e.target.value)} placeholder="fitness, anime..." />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 mb-1">Quirks</p>
                            <Input value={quirks} onChange={(e) => setQuirks(e.target.value)} placeholder="says 'jaja' a lot..." />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <p className="text-xs text-gray-500 mb-1">Emoji usage</p>
                            <Select<Option>
                                instanceId="agent-emoji"
                                options={toOptions(['low', 'medium', 'high'])}
                                value={toOptions(['low', 'medium', 'high']).find((o) => o.value === emojiUsage) ?? null}
                                onChange={(opt) => opt && setEmojiUsage(opt.value as 'low' | 'medium' | 'high')}
                            />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 mb-1">Languages (comma separated)</p>
                            <Input value={languages} onChange={(e) => setLanguages(e.target.value)} placeholder="en, es" />
                        </div>
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 mb-1">Writing style (how she texts)</p>
                        <Input
                            textArea
                            rows={3}
                            value={writingStyle}
                            onChange={(e) => setWritingStyle(e.target.value)}
                            placeholder="Short lowercase messages, drops punctuation, teases with ellipses..."
                        />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 mb-1">Boundaries (non-negotiable)</p>
                        <Input
                            textArea
                            rows={3}
                            value={boundaries}
                            onChange={(e) => setBoundaries(e.target.value)}
                            placeholder="Never agree to meet in person. Never share personal contact info..."
                        />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 mb-1">
                            System prompt override (optional — replaces all fields above when set)
                        </p>
                        <Input
                            textArea
                            rows={4}
                            value={systemPrompt}
                            onChange={(e) => setSystemPrompt(e.target.value)}
                            placeholder="Advanced: write the full system prompt yourself"
                        />
                    </div>
                </div>
            </Card>

            <div className="flex items-center justify-end gap-2">
                <Button variant="solid" loading={isSaving} onClick={handleSave}>
                    Save persona
                </Button>
            </div>
        </div>
    )
}

export default PersonaEditor
