'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Tag from '@/components/ui/Tag'
import Input from '@/components/ui/Input'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import {
    connectUploadPostAccount,
    disconnectUploadPostAccount,
    registerUploadPostWebhook,
    syncConnectedAccounts,
    type AvatarSocialAccountRow,
    type SocialProfileSummary,
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
