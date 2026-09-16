'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Tag from '@/components/ui/Tag'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Switcher from '@/components/ui/Switcher'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import {
    connectUploadPostAccount,
    disconnectUploadPostAccount,
    registerUploadPostWebhook,
    syncConnectedAccounts,
    updateSocialCommentSettings,
    type AvatarSocialAccountRow,
    type SocialProfileSummary,
    type SocialCommentSettingsPatch,
} from '@/services/SocialService'

interface AccountsClientProps {
    initialAccounts: AvatarSocialAccountRow[]
    loadError: string | null
}

interface ConnectedAccountChip {
    platform?: string
    accountName?: string
    avatarUrl?: string
}

/** Connected platforms come back either as bare strings or account objects. */
function toChip(p: unknown): ConnectedAccountChip {
    if (typeof p === 'string') return { platform: p }
    const obj = (p ?? {}) as Record<string, unknown>
    return {
        platform: typeof obj.platform === 'string' ? obj.platform : undefined,
        accountName: typeof obj.accountName === 'string' ? obj.accountName : undefined,
        avatarUrl: typeof obj.avatarUrl === 'string' ? obj.avatarUrl : undefined,
    }
}

function statusTag(profile: SocialProfileSummary | null) {
    if (!profile || (!profile.hasApiKey && profile.status !== 'active')) {
        return (
            <Tag className="bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-100 border-0">
                No account
            </Tag>
        )
    }
    if (profile.status === 'active') {
        return (
            <Tag className="bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-100 border-0">
                Connected
            </Tag>
        )
    }
    return (
        <Tag className="bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-100 border-0">
            Disconnected
        </Tag>
    )
}

const ACCOUNTS_PATH = '/concepts/avatar-forge/social/accounts'

const CHAT_MODE_OPTIONS: { value: 'draft' | 'auto'; label: string }[] = [
    { value: 'draft', label: 'Draft (review in Inbox)' },
    { value: 'auto', label: 'Auto (autopilot rules apply)' },
]

const MAX_DM_BUTTONS = 3

interface DmDraft {
    text: string
    buttons: { title: string; url: string }[]
}

/**
 * Per-avatar Upload-Post accounts: every avatar row manages its OWN
 * Upload-Post account (own API key, own linked socials). The key is pasted
 * here, validated server-side, and never comes back to the client (only
 * `apiKeyLast4`/`usesEnvKey` flags do).
 */
const AccountsClient = ({ initialAccounts, loadError }: AccountsClientProps) => {
    const [accounts, setAccounts] = useState<AvatarSocialAccountRow[]>(initialAccounts)
    const [error, setError] = useState<string | null>(loadError)
    const [cardErrors, setCardErrors] = useState<Record<string, string>>({})
    const [keyInputs, setKeyInputs] = useState<Record<string, string>>({})
    const [editingKey, setEditingKey] = useState<Record<string, boolean>>({})
    const [busyAvatar, setBusyAvatar] = useState<string | null>(null)
    const [confirmDisconnect, setConfirmDisconnect] = useState<AvatarSocialAccountRow | null>(null)
    // Field being saved right now, per avatar — mismo patrón que `savingAi`
    // en TelegramConnectionPanel, pero indexado por avatar porque esta
    // pantalla muestra una tarjeta por avatar.
    const [aiSavingField, setAiSavingField] = useState<Record<string, string | null>>({})
    const [savingDm, setSavingDm] = useState<string | null>(null)
    // Borrador local del texto/botones del DM — sólo se guarda al pulsar
    // "Save DM". Antes de que el usuario toque algo, se lee del perfil.
    const [dmDrafts, setDmDrafts] = useState<Record<string, DmDraft>>({})
    const router = useRouter()
    const searchParams = useSearchParams()
    const handledConnectParams = useRef(false)

    const applyProfile = (avatarId: string, profile: SocialProfileSummary | null) => {
        setAccounts((prev) =>
            prev.map((a) => (a.avatarId === avatarId ? { ...a, profile } : a)),
        )
    }

    const setCardError = (avatarId: string, message: string | null) => {
        setCardErrors((prev) => {
            const next = { ...prev }
            if (message) next[avatarId] = message
            else delete next[avatarId]
            return next
        })
    }

    const handleConnectAccount = async (avatarId: string) => {
        const apiKey = (keyInputs[avatarId] ?? '').trim()
        if (!apiKey) {
            setCardError(avatarId, 'Paste the Upload-Post API key for this avatar first')
            return
        }
        setBusyAvatar(avatarId)
        setCardError(avatarId, null)
        try {
            const result = await connectUploadPostAccount({ avatarId, apiKey })
            if (result.success && result.data) {
                applyProfile(avatarId, result.data)
                setKeyInputs((prev) => ({ ...prev, [avatarId]: '' }))
                setEditingKey((prev) => ({ ...prev, [avatarId]: false }))
                toast.push(
                    <Notification type="success" title="Account connected">
                        Upload-Post account linked — now connect its social networks
                    </Notification>,
                )
            } else {
                setCardError(avatarId, result.error ?? 'Failed to connect account')
            }
        } finally {
            setBusyAvatar(null)
        }
    }

    const handleConnectSocials = (avatarId: string) => {
        window.open(
            `/api/social/connect?avatarId=${encodeURIComponent(avatarId)}`,
            '_blank',
            'width=600,height=760',
        )
    }

    const handleRefresh = async (avatarId: string) => {
        setBusyAvatar(avatarId)
        setCardError(avatarId, null)
        try {
            const result = await syncConnectedAccounts(avatarId)
            if (result.success && result.data) {
                applyProfile(avatarId, result.data)
            } else {
                setCardError(avatarId, result.error ?? 'Failed to refresh connected accounts')
            }
        } finally {
            setBusyAvatar(null)
        }
    }

    const handleDisconnect = async () => {
        const target = confirmDisconnect
        setConfirmDisconnect(null)
        if (!target) return
        setBusyAvatar(target.avatarId)
        setCardError(target.avatarId, null)
        try {
            const result = await disconnectUploadPostAccount(target.avatarId)
            if (result.success && result.data) {
                applyProfile(target.avatarId, result.data)
                toast.push(
                    <Notification type="info" title="Account disconnected">
                        The API key was forgotten. Posts already scheduled on Upload-Post
                        will still publish.
                    </Notification>,
                )
            } else {
                setCardError(target.avatarId, result.error ?? 'Failed to disconnect')
            }
        } finally {
            setBusyAvatar(null)
        }
    }

    const handleRegisterWebhook = async (avatarId: string) => {
        setBusyAvatar(avatarId)
        try {
            const result = await registerUploadPostWebhook(avatarId)
            toast.push(
                result.success ? (
                    <Notification type="success" title="Webhook registered">
                        Upload-Post will notify this app of publish events for this account
                    </Notification>
                ) : (
                    <Notification type="danger" title="Webhook registration failed">
                        {result.error ?? 'Unknown error'}
                    </Notification>
                ),
            )
        } finally {
            setBusyAvatar(null)
        }
    }

    const getDmDraft = (account: AvatarSocialAccountRow): DmDraft =>
        dmDrafts[account.avatarId] ?? {
            text: account.profile?.aiCommentDmText ?? '',
            buttons: account.profile?.aiCommentDmButtons ?? [],
        }

    const setDmDraft = (avatarId: string, draft: DmDraft) => {
        setDmDrafts((prev) => ({ ...prev, [avatarId]: draft }))
    }

    /** Guarda un único campo (Switcher/Select) de "IA en comentarios" — se
     *  envía al instante, como los interruptores de Telegram. */
    const saveCommentSetting = async (
        account: AvatarSocialAccountRow,
        field: string,
        patch: SocialCommentSettingsPatch,
    ) => {
        setAiSavingField((prev) => ({ ...prev, [account.avatarId]: field }))
        try {
            const result = await updateSocialCommentSettings(account.avatarId, patch)
            if (result.success && result.data) {
                applyProfile(account.avatarId, result.data)
                toast.push(<Notification type="success" title="Settings saved" />)
            } else {
                toast.push(
                    <Notification type="danger" title="Could not save AI comment settings">
                        {result.error ?? 'Unknown error'}
                    </Notification>,
                )
            }
        } finally {
            setAiSavingField((prev) => ({ ...prev, [account.avatarId]: null }))
        }
    }

    const handleDmTextChange = (account: AvatarSocialAccountRow, text: string) => {
        setDmDraft(account.avatarId, { ...getDmDraft(account), text })
    }

    const handleDmButtonChange = (
        account: AvatarSocialAccountRow,
        index: number,
        field: 'title' | 'url',
        value: string,
    ) => {
        const draft = getDmDraft(account)
        const buttons = draft.buttons.map((button, i) =>
            i === index ? { ...button, [field]: value } : button,
        )
        setDmDraft(account.avatarId, { ...draft, buttons })
    }

    const handleAddDmButton = (account: AvatarSocialAccountRow) => {
        const draft = getDmDraft(account)
        if (draft.buttons.length >= MAX_DM_BUTTONS) return
        setDmDraft(account.avatarId, { ...draft, buttons: [...draft.buttons, { title: '', url: '' }] })
    }

    const handleRemoveDmButton = (account: AvatarSocialAccountRow, index: number) => {
        const draft = getDmDraft(account)
        setDmDraft(account.avatarId, {
            ...draft,
            buttons: draft.buttons.filter((_, i) => i !== index),
        })
    }

    const handleSaveDm = async (account: AvatarSocialAccountRow) => {
        const draft = getDmDraft(account)
        setSavingDm(account.avatarId)
        try {
            const result = await updateSocialCommentSettings(account.avatarId, {
                aiCommentDmText: draft.text,
                aiCommentDmButtons: draft.buttons,
            })
            if (result.success && result.data) {
                applyProfile(account.avatarId, result.data)
                toast.push(<Notification type="success" title="DM settings saved" />)
            } else {
                toast.push(
                    <Notification type="danger" title="Could not save DM settings">
                        {result.error ?? 'Unknown error'}
                    </Notification>,
                )
            }
        } finally {
            setSavingDm(null)
        }
    }

    // Reflect `?connected=1&avatarId=...` / `?error=...` set by
    // `/api/social/connect` and `/api/social/callback` after the hosted
    // connect flow. Refreshes just the returning avatar when known. Runs once
    // on mount, then strips the params so back-nav doesn't re-trigger it.
    useEffect(() => {
        if (handledConnectParams.current) return
        const connected = searchParams.get('connected')
        const connectError = searchParams.get('error')
        const avatarId = searchParams.get('avatarId')
        if (!connected && !connectError) return
        handledConnectParams.current = true

        if (connected === '1') {
            if (avatarId) handleRefresh(avatarId)
            toast.push(
                <Notification type="success" title="Account connected">
                    Refreshing the connected social accounts
                </Notification>,
            )
        } else if (connectError) {
            setError(connectError)
        }

        router.replace(ACCOUNTS_PATH)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams])

    return (
        <div className="flex flex-col gap-4">
            {error && (
                <div className="p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg">
                    <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                </div>
            )}

            {accounts.length === 0 && !error && (
                <Card>
                    <p className="text-sm text-gray-500">
                        No avatars yet — create one in Avatar Studio first.
                    </p>
                </Card>
            )}

            {accounts.map((account) => {
                const profile = account.profile
                const isActive = profile?.status === 'active'
                const isBusy = busyAvatar === account.avatarId
                const cardError = cardErrors[account.avatarId]
                const showKeyForm = !isActive || editingKey[account.avatarId]
                const chips = (profile?.connectedPlatforms ?? []).map(toChip)

                return (
                    <Card key={account.avatarId}>
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                            <h6 className="font-bold">{account.avatarName}</h6>
                            {statusTag(profile)}
                            {isActive && profile?.usesEnvKey && (
                                <Tag className="bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-100 border-0">
                                    Default key (env)
                                </Tag>
                            )}
                            {isActive && !profile?.usesEnvKey && profile?.apiKeyLast4 && (
                                <span className="text-xs text-gray-400 font-mono">
                                    Key ····{profile.apiKeyLast4}
                                </span>
                            )}
                        </div>

                        {cardError && (
                            <div className="p-2 mb-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg">
                                <p className="text-xs text-red-600 dark:text-red-400">{cardError}</p>
                            </div>
                        )}

                        {showKeyForm && (
                            <div className="flex flex-wrap items-center gap-2 mb-3">
                                <div className="w-full sm:w-80">
                                    <Input
                                        type="password"
                                        size="sm"
                                        value={keyInputs[account.avatarId] ?? ''}
                                        placeholder="Upload-Post API key for this avatar's account"
                                        onChange={(e) =>
                                            setKeyInputs((prev) => ({
                                                ...prev,
                                                [account.avatarId]: e.target.value,
                                            }))
                                        }
                                    />
                                </div>
                                <Button
                                    variant="solid"
                                    size="sm"
                                    loading={isBusy}
                                    onClick={() => handleConnectAccount(account.avatarId)}
                                >
                                    {isActive ? 'Save key' : 'Connect account'}
                                </Button>
                                {isActive && (
                                    <Button
                                        variant="plain"
                                        size="sm"
                                        disabled={isBusy}
                                        onClick={() =>
                                            setEditingKey((prev) => ({
                                                ...prev,
                                                [account.avatarId]: false,
                                            }))
                                        }
                                    >
                                        Cancel
                                    </Button>
                                )}
                            </div>
                        )}

                        {isActive && (
                            <>
                                <div className="mb-3">
                                    <p className="text-sm font-semibold mb-2">Connected socials</p>
                                    {chips.length > 0 ? (
                                        <div className="flex flex-wrap gap-2">
                                            {chips.map((chip, idx) => (
                                                <Tag
                                                    key={idx}
                                                    className="inline-flex items-center gap-1.5"
                                                >
                                                    {chip.avatarUrl && (
                                                        <img
                                                            src={chip.avatarUrl}
                                                            alt=""
                                                            className="w-4 h-4 rounded-full object-cover"
                                                        />
                                                    )}
                                                    <span className="capitalize">{chip.platform}</span>
                                                    {chip.accountName && (
                                                        <span className="text-gray-400">
                                                            {chip.accountName}
                                                        </span>
                                                    )}
                                                </Tag>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-gray-500">
                                            No socials linked yet — click &quot;Connect socials&quot;
                                            to link Instagram, X, TikTok…
                                        </p>
                                    )}
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                        variant="solid"
                                        size="sm"
                                        disabled={isBusy}
                                        onClick={() => handleConnectSocials(account.avatarId)}
                                    >
                                        Connect socials
                                    </Button>
                                    <Button
                                        size="sm"
                                        loading={isBusy}
                                        onClick={() => handleRefresh(account.avatarId)}
                                    >
                                        Refresh
                                    </Button>
                                    {!editingKey[account.avatarId] && (
                                        <Button
                                            variant="plain"
                                            size="sm"
                                            disabled={isBusy}
                                            onClick={() =>
                                                setEditingKey((prev) => ({
                                                    ...prev,
                                                    [account.avatarId]: true,
                                                }))
                                            }
                                        >
                                            Change key
                                        </Button>
                                    )}
                                    <Button
                                        variant="plain"
                                        size="sm"
                                        disabled={isBusy}
                                        onClick={() => handleRegisterWebhook(account.avatarId)}
                                    >
                                        Register webhook
                                    </Button>
                                    <Button
                                        variant="plain"
                                        size="sm"
                                        disabled={isBusy}
                                        customColorClass={() => 'text-red-500 hover:text-red-600'}
                                        onClick={() => setConfirmDisconnect(account)}
                                    >
                                        Disconnect
                                    </Button>
                                </div>

                                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                                    <p className="text-sm font-semibold mb-1">AI comment replies</p>
                                    <p className="text-xs text-gray-500 mb-4">
                                        Lets the agent reply to public comments on this avatar&apos;s
                                        posts.
                                    </p>

                                    <div className="flex items-center justify-between gap-3 mb-4">
                                        <div>
                                            <p className="text-sm">Reply to comments with AI</p>
                                            <p className="text-xs text-gray-400">
                                                Turns on comment polling and replies for this
                                                avatar&apos;s connected accounts.
                                            </p>
                                        </div>
                                        <Switcher
                                            checked={profile?.aiCommentRepliesEnabled ?? false}
                                            isLoading={
                                                aiSavingField[account.avatarId] ===
                                                'aiCommentRepliesEnabled'
                                            }
                                            onChange={(checked) =>
                                                saveCommentSetting(
                                                    account,
                                                    'aiCommentRepliesEnabled',
                                                    { aiCommentRepliesEnabled: checked },
                                                )
                                            }
                                        />
                                    </div>

                                    <div className="mb-4">
                                        <p className="text-sm mb-1">New comment threads start as</p>
                                        <p className="text-xs text-gray-400 mb-2">
                                            Draft leaves the reply for you to approve in the Inbox.
                                            Auto sends by itself once Autopilot rules allow it.
                                            Existing threads keep their own mode.
                                        </p>
                                        <div className="w-full sm:w-72">
                                            <Select
                                                instanceId={`chat-mode-${account.avatarId}`}
                                                isDisabled={!profile?.aiCommentRepliesEnabled}
                                                isLoading={
                                                    aiSavingField[account.avatarId] ===
                                                    'aiCommentDefaultChatMode'
                                                }
                                                options={CHAT_MODE_OPTIONS}
                                                value={CHAT_MODE_OPTIONS.find(
                                                    (option) =>
                                                        option.value ===
                                                        (profile?.aiCommentDefaultChatMode ?? 'draft'),
                                                )}
                                                onChange={(option) =>
                                                    option &&
                                                    saveCommentSetting(
                                                        account,
                                                        'aiCommentDefaultChatMode',
                                                        { aiCommentDefaultChatMode: option.value },
                                                    )
                                                }
                                            />
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between gap-3 mb-1">
                                        <div>
                                            <p className="text-sm">
                                                Send an Instagram DM after replying
                                            </p>
                                        </div>
                                        <Switcher
                                            checked={profile?.aiCommentDmEnabled ?? false}
                                            isLoading={
                                                aiSavingField[account.avatarId] === 'aiCommentDmEnabled'
                                            }
                                            onChange={(checked) =>
                                                saveCommentSetting(account, 'aiCommentDmEnabled', {
                                                    aiCommentDmEnabled: checked,
                                                })
                                            }
                                        />
                                    </div>
                                    <p className="text-xs text-gray-400 mb-3">
                                        Instagram only. Meta allows one private reply per comment,
                                        within 7 days.
                                    </p>

                                    {(() => {
                                        const dmDraft = getDmDraft(account)
                                        if (!profile?.aiCommentDmEnabled && !dmDraft.text) return null
                                        return (
                                            <div className="flex flex-col gap-2">
                                                <Input
                                                    textArea
                                                    rows={2}
                                                    placeholder="DM text sent privately after the public reply"
                                                    value={dmDraft.text}
                                                    onChange={(e) =>
                                                        handleDmTextChange(account, e.target.value)
                                                    }
                                                />
                                                {dmDraft.buttons.map((button, index) => (
                                                    <div
                                                        key={index}
                                                        className="flex flex-wrap items-center gap-2"
                                                    >
                                                        <div className="w-full sm:w-40">
                                                            <Input
                                                                size="sm"
                                                                maxLength={20}
                                                                placeholder="Button title"
                                                                value={button.title}
                                                                onChange={(e) =>
                                                                    handleDmButtonChange(
                                                                        account,
                                                                        index,
                                                                        'title',
                                                                        e.target.value,
                                                                    )
                                                                }
                                                            />
                                                        </div>
                                                        <div className="w-full sm:w-64">
                                                            <Input
                                                                size="sm"
                                                                placeholder="https://…"
                                                                value={button.url}
                                                                onChange={(e) =>
                                                                    handleDmButtonChange(
                                                                        account,
                                                                        index,
                                                                        'url',
                                                                        e.target.value,
                                                                    )
                                                                }
                                                            />
                                                        </div>
                                                        <Button
                                                            variant="plain"
                                                            size="sm"
                                                            customColorClass={() =>
                                                                'text-red-500 hover:text-red-600'
                                                            }
                                                            onClick={() =>
                                                                handleRemoveDmButton(account, index)
                                                            }
                                                        >
                                                            Remove
                                                        </Button>
                                                    </div>
                                                ))}
                                                {dmDraft.buttons.length < MAX_DM_BUTTONS && (
                                                    <div>
                                                        <Button
                                                            variant="plain"
                                                            size="sm"
                                                            onClick={() => handleAddDmButton(account)}
                                                        >
                                                            Add button
                                                        </Button>
                                                    </div>
                                                )}
                                                <div>
                                                    <Button
                                                        variant="solid"
                                                        size="sm"
                                                        loading={savingDm === account.avatarId}
                                                        onClick={() => handleSaveDm(account)}
                                                    >
                                                        Save DM
                                                    </Button>
                                                </div>
                                            </div>
                                        )
                                    })()}
                                </div>
                            </>
                        )}
                    </Card>
                )
            })}

            <ConfirmDialog
                isOpen={!!confirmDisconnect}
                type="danger"
                title={`Disconnect ${confirmDisconnect?.avatarName ?? ''}?`}
                confirmText="Disconnect"
                confirmButtonProps={{ color: 'red' }}
                onClose={() => setConfirmDisconnect(null)}
                onRequestClose={() => setConfirmDisconnect(null)}
                onCancel={() => setConfirmDisconnect(null)}
                onConfirm={handleDisconnect}
            >
                <p>
                    This forgets the stored API key locally. The Upload-Post account and
                    its linked socials stay intact on Upload-Post&apos;s side, and posts
                    already scheduled there will still publish. Reconnecting requires
                    pasting the key again.
                </p>
            </ConfirmDialog>
        </div>
    )
}

export default AccountsClient
