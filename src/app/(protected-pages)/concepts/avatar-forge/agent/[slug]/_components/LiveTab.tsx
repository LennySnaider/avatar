'use client'

/**
 * Pestaña "Live" del agente (módulo premium `live_avatar`): ajustes del modo
 * en vivo, llamada de prueba y link público. Sólo se pinta si la org tiene
 * el módulo instalado (lo decide `AgentView`); el servicio lo vuelve a
 * comprobar en cada acción.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Switcher from '@/components/ui/Switcher'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import LiveAvatarCall from '@/components/shared/LiveAvatarCall/LiveAvatarCall'
import type { LiveBootstrap } from '@/components/shared/LiveAvatarCall/useLiveCall'
import {
    createLiveFaceFromAvatar,
    getLiveTabData,
    refreshLiveFaceStatus,
    rotateLivePublicToken,
    startInternalLiveSession,
    updateLiveSettings,
    type LiveTabData,
} from '@/services/AgentLiveService'
import { FACE_PROVIDER_CONSOLE, FACE_PROVIDER_LABEL, type FaceProvider } from '@/lib/live/face/types'

interface Option {
    value: string
    label: string
}

const PROVIDER_OPTIONS: Option[] = [
    { value: 'liveavatar', label: 'LiveAvatar de HeyGen (más barato por minuto)' },
    { value: 'anam', label: 'Anam (crea la cara desde la foto)' },
]

const STT_OPTIONS: Option[] = [
    { value: '', label: 'Default (MiniMax)' },
    { value: 'minimax', label: 'MiniMax' },
    { value: 'gemini', label: 'Gemini' },
]

const API_KEY_ENV: Record<FaceProvider, string> = {
    anam: 'ANAM_API_KEY',
    liveavatar: 'LIVEAVATAR_API_KEY',
}

interface LiveTabProps {
    avatarId: string
    avatarName: string
}

const notify = (ok: boolean, title: string, body?: string) =>
    toast.push(
        <Notification type={ok ? 'success' : 'danger'} title={title}>
            {body}
        </Notification>,
    )

const LiveTab = ({ avatarId, avatarName }: LiveTabProps) => {
    const [data, setData] = useState<LiveTabData | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [creatingFace, setCreatingFace] = useState(false)

    const [enabled, setEnabled] = useState(false)
    const [provider, setProvider] = useState<FaceProvider>('liveavatar')
    const [faceId, setFaceId] = useState('')
    const [greeting, setGreeting] = useState('')
    const [stt, setStt] = useState('')
    const [publicEnabled, setPublicEnabled] = useState(false)
    const [maxMinutes, setMaxMinutes] = useState('10')
    const [maxConcurrent, setMaxConcurrent] = useState('3')
    const [dailyMinutes, setDailyMinutes] = useState('120')
    const [origins, setOrigins] = useState('')
    const [publicToken, setPublicToken] = useState<string | null>(null)

    const load = useCallback(async () => {
        const r = await getLiveTabData(avatarId)
        if (!r.success || !r.data) {
            setLoadError(r.error ?? 'No se pudo cargar')
            return
        }
        const d = r.data
        setData(d)
        setPublicToken(d.publicToken)
        const s = d.settings
        if (s) {
            setEnabled(s.enabled)
            setProvider(s.faceProvider)
            setFaceId(s.faceId ?? '')
            setGreeting(s.greeting ?? '')
            setStt(s.sttProvider ?? '')
            setPublicEnabled(s.publicEnabled)
            setMaxMinutes(String(Math.round(s.maxSessionSeconds / 60)))
            setMaxConcurrent(String(s.maxConcurrentSessions))
            setDailyMinutes(String(s.dailyMinutesCap))
            setOrigins(s.allowedOrigins.join('\n'))
        }
    }, [avatarId])

    useEffect(() => {
        void load()
    }, [load])

    const bootstrap = useCallback(async (): Promise<LiveBootstrap> => {
        const r = await startInternalLiveSession(avatarId)
        if (!r.success || !r.data) throw new Error(r.error ?? 'No se pudo iniciar la llamada')
        return r.data
    }, [avatarId])

    const publicUrl = useMemo(() => {
        if (!publicToken || typeof window === 'undefined') return null
        return `${window.location.origin}/live/${publicToken}`
    }, [publicToken])

    const save = async () => {
        setSaving(true)
        try {
            const r = await updateLiveSettings(avatarId, {
                enabled,
                faceProvider: provider,
                faceId,
                greeting,
                sttProvider: stt === 'minimax' || stt === 'gemini' ? stt : null,
                publicEnabled,
                maxSessionSeconds: Math.max(1, Number(maxMinutes) || 10) * 60,
                maxConcurrentSessions: Number(maxConcurrent) || 3,
                dailyMinutesCap: Math.max(0, Number(dailyMinutes) || 0),
                allowedOrigins: origins.split(/\s+/).filter(Boolean),
            })
            notify(r.success, r.success ? 'Live settings saved' : 'Failed', r.error)
            if (r.success) await load()
        } finally {
            setSaving(false)
        }
    }

    const createFace = async () => {
        setCreatingFace(true)
        try {
            const r = await createLiveFaceFromAvatar(avatarId)
            notify(
                r.success,
                r.success ? 'Live face requested' : 'Failed',
                r.success ? 'Anam is preparing it from the avatar photo (about 2 minutes).' : r.error,
            )
            if (r.success) await load()
        } finally {
            setCreatingFace(false)
        }
    }

    const refreshFace = async () => {
        const r = await refreshLiveFaceStatus(avatarId)
        if (!r.success) notify(false, 'Failed', r.error)
        await load()
    }

    const rotate = async () => {
        if (!window.confirm('The current public link will stop working immediately. Continue?')) return
        const r = await rotateLivePublicToken(avatarId)
        if (r.success && r.data) setPublicToken(r.data.publicToken)
        notify(r.success, r.success ? 'New public link generated' : 'Failed', r.error)
    }

    if (loadError) {
        return (
            <Alert type="danger" showIcon className="max-w-4xl">
                {loadError}
            </Alert>
        )
    }
    if (!data) return <p className="text-sm text-gray-500">Loading live mode…</p>

    const providerReady = data.configuredProviders.includes(provider)
    const missing: string[] = []
    if (!data.hasPersona) missing.push('a persona (Persona tab)')
    if (!data.hasVoice) missing.push('a default cloned voice (Voice Studio)')
    if (!data.settings?.faceId) missing.push('a live face id (below)')
    const snippet = publicToken
        ? `<script src="${typeof window === 'undefined' ? '' : window.location.origin}/live-widget.js" data-token="${publicToken}" async></script>`
        : ''

    return (
        <div className="max-w-4xl space-y-4">
            {missing.length > 0 && (
                <Alert type="warning" showIcon>
                    To go live this avatar still needs: {missing.join(', ')}.
                </Alert>
            )}
            {!providerReady && (
                <Alert type="warning" showIcon>
                    {FACE_PROVIDER_LABEL[provider]} has no API key in this environment (
                    {API_KEY_ENV[provider]}). Add it in Vercel.
                </Alert>
            )}

            <Card>
                <div className="flex items-center gap-3 mb-4">
                    <Switcher checked={enabled} disabled={!data.canManage} onChange={(c) => setEnabled(c)} />
                    <div>
                        <p className="text-sm font-semibold">Live mode</p>
                        <p className="text-xs text-gray-400">
                            Real-time video call: the avatar&apos;s face, its cloned voice ({data.voiceName ?? 'none'})
                            and its persona, answering by microphone. Explicit content is capped to suggestive.
                        </p>
                    </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <p className="text-xs text-gray-500 mb-1">Face provider</p>
                        <Select<Option>
                            instanceId="live-face-provider"
                            options={PROVIDER_OPTIONS}
                            value={PROVIDER_OPTIONS.find((o) => o.value === provider) ?? null}
                            isDisabled={!data.canManage}
                            onChange={(opt) => opt && setProvider(opt.value as FaceProvider)}
                        />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 mb-1">
                            Face id —{' '}
                            <a className="underline" href={FACE_PROVIDER_CONSOLE[provider]} target="_blank" rel="noreferrer">
                                create it from this avatar&apos;s face photo
                            </a>
                        </p>
                        <Input
                            value={faceId}
                            disabled={!data.canManage}
                            placeholder="avatar / face id"
                            onChange={(e) => setFaceId(e.target.value)}
                        />
                        <div className="flex items-center gap-2 mt-2">
                            <Button
                                size="xs"
                                loading={creatingFace}
                                disabled={!data.canManage || !data.configuredProviders.includes('anam')}
                                onClick={() => void createFace()}
                            >
                                Create from this avatar&apos;s photo (Anam)
                            </Button>
                            {data.settings?.faceStatus === 'pending' && (
                                <>
                                    <span className="text-xs text-amber-600">Preparing…</span>
                                    <Button size="xs" variant="plain" onClick={() => void refreshFace()}>
                                        Refresh
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                    <div className="sm:col-span-2">
                        <p className="text-xs text-gray-500 mb-1">Greeting (optional — empty lets the persona improvise)</p>
                        <Input
                            value={greeting}
                            disabled={!data.canManage}
                            placeholder="¡Hola! Soy Mia, ¿cómo te llamas?"
                            onChange={(e) => setGreeting(e.target.value)}
                        />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 mb-1">Speech-to-text</p>
                        <Select<Option>
                            instanceId="live-stt"
                            options={STT_OPTIONS}
                            value={STT_OPTIONS.find((o) => o.value === stt) ?? STT_OPTIONS[0]}
                            isDisabled={!data.canManage}
                            onChange={(opt) => opt && setStt(opt.value)}
                        />
                    </div>
                </div>

                <div className="border-t border-gray-200 dark:border-gray-700 mt-5 pt-4">
                    <div className="flex items-center gap-3 mb-3">
                        <Switcher
                            checked={publicEnabled}
                            disabled={!data.canManage}
                            onChange={(c) => setPublicEnabled(c)}
                        />
                        <div>
                            <p className="text-sm font-semibold">Public link &amp; website widget</p>
                            <p className="text-xs text-gray-400">
                                Anyone with the link can call this avatar, within the limits below.
                            </p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                            <p className="text-xs text-gray-500 mb-1">Max minutes per call</p>
                            <Input type="number" value={maxMinutes} disabled={!data.canManage} onChange={(e) => setMaxMinutes(e.target.value)} />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 mb-1">Simultaneous calls</p>
                            <Input type="number" value={maxConcurrent} disabled={!data.canManage} onChange={(e) => setMaxConcurrent(e.target.value)} />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 mb-1">Minutes per day (0 = no cap)</p>
                            <Input type="number" value={dailyMinutes} disabled={!data.canManage} onChange={(e) => setDailyMinutes(e.target.value)} />
                        </div>
                        <div className="sm:col-span-3">
                            <p className="text-xs text-gray-500 mb-1">
                                Websites allowed to embed the widget (one per line, e.g. https://mysite.com — empty = any)
                            </p>
                            <Input textArea rows={2} value={origins} disabled={!data.canManage} onChange={(e) => setOrigins(e.target.value)} />
                        </div>
                    </div>
                    {publicEnabled && publicUrl && data.settings?.publicEnabled && (
                        <div className="mt-3 space-y-2">
                            <p className="text-xs text-gray-500">Public link</p>
                            <Input readOnly value={publicUrl} onFocus={(e) => e.currentTarget.select()} />
                            <p className="text-xs text-gray-500">Widget for any website (paste before &lt;/body&gt;)</p>
                            <Input readOnly textArea rows={2} value={snippet} onFocus={(e) => e.currentTarget.select()} />
                            <Button size="sm" onClick={() => void rotate()}>
                                Generate a new link
                            </Button>
                        </div>
                    )}
                </div>

                <div className="flex justify-end mt-4">
                    <Button variant="solid" loading={saving} disabled={!data.canManage} onClick={() => void save()}>
                        Save live settings
                    </Button>
                </div>
            </Card>

            <Card>
                <p className="text-sm font-semibold mb-1">Test call</p>
                <p className="text-xs text-gray-400 mb-4">
                    Talk to {avatarName} exactly as a visitor would. The conversation shows up in the Inbox as a
                    read-only transcript.
                </p>
                {data.canTest && data.settings?.enabled ? (
                    <LiveAvatarCall avatarName={avatarName} bootstrap={bootstrap} />
                ) : (
                    <Alert type="info" showIcon>
                        {data.canTest ? 'Turn on live mode and save to test the call.' : 'Your role cannot start test calls.'}
                    </Alert>
                )}
            </Card>
        </div>
    )
}

export default LiveTab
