'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Tag from '@/components/ui/Tag'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import {
    ensureSocialProfile,
    syncConnectedAccounts,
    registerUploadPostWebhook,
    type SocialProfileRow,
} from '@/services/SocialService'

interface AccountsClientProps {
    initialProfile: SocialProfileRow | null
    loadError: string | null
}

function platformLabel(p: unknown): string {
    if (typeof p === 'string') return p
    return (p as { platform?: string })?.platform ?? JSON.stringify(p)
}

const AccountsClient = ({ initialProfile, loadError }: AccountsClientProps) => {
    const [profile, setProfile] = useState<SocialProfileRow | null>(initialProfile)
    const [error, setError] = useState<string | null>(loadError)
    const [isBusy, setIsBusy] = useState(false)
    const router = useRouter()
    const searchParams = useSearchParams()
    const handledConnectParams = useRef(false)

    const handleSetup = async () => {
        setIsBusy(true)
        setError(null)
        try {
            const result = await ensureSocialProfile()
            if (result.success) {
                setProfile(result.data ?? null)
            } else {
                setError(result.error ?? 'Failed to set up social profile')
            }
        } finally {
            setIsBusy(false)
        }
    }

    const handleConnect = () => {
        window.open('/api/social/connect', '_blank', 'width=600,height=760')
    }

    const handleRefresh = async () => {
        setIsBusy(true)
        setError(null)
        try {
            const result = await syncConnectedAccounts()
            if (result.success) {
                setProfile(result.data ?? null)
            } else {
                setError(result.error ?? 'Failed to refresh connected accounts')
            }
        } finally {
            setIsBusy(false)
        }
    }

    // Reflect `?connected=1` / `?error=...` set by
    // `/api/social/connect` and `/api/social/callback` — those routes
    // redirect back here after the Upload-Post hosted connect flow but the
    // page previously never read the query string, so a user landing back
    // here with a fresh connection (or a failed connect attempt) saw no
    // feedback at all. Runs once on mount, then strips the params so a
    // refresh/back-nav doesn't re-trigger it.
    useEffect(() => {
        if (handledConnectParams.current) return
        const connected = searchParams.get('connected')
        const connectError = searchParams.get('error')
        if (!connected && !connectError) return
        handledConnectParams.current = true

        if (connected === '1') {
            handleRefresh()
            toast.push(
                <Notification type="success" title="Account connected">
                    Refreshing your connected social accounts
                </Notification>,
            )
        } else if (connectError) {
            setError(connectError)
        }

        router.replace('/concepts/avatar-forge/social/accounts')
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams])

    const handleRegisterWebhook = async () => {
        setIsBusy(true)
        try {
            const result = await registerUploadPostWebhook()
            if (result.success) {
                toast.push(
                    <Notification type="success" title="Webhook registered">
                        Upload-Post will now notify this app of publish events
                    </Notification>
                )
            } else {
                toast.push(
                    <Notification type="danger" title="Webhook registration failed">
                        {result.error ?? 'Unknown error'}
                    </Notification>
                )
            }
        } finally {
            setIsBusy(false)
        }
    }

    return (
        <div className="flex flex-col gap-4">
            {error && (
                <div className="p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg">
                    <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                </div>
            )}

            {!profile ? (
                <Card>
                    <p className="mb-4 text-sm text-gray-500">
                        No social profile yet. Set one up to start connecting your social accounts.
                    </p>
                    <Button variant="solid" loading={isBusy} onClick={handleSetup}>
                        Set up social profile
                    </Button>
                </Card>
            ) : (
                <Card>
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                        <Button variant="solid" disabled={isBusy} onClick={handleConnect}>
                            Connect accounts
                        </Button>
                        <Button loading={isBusy} onClick={handleRefresh}>
                            Refresh
                        </Button>
                        <Button
                            variant="plain"
                            size="sm"
                            loading={isBusy}
                            onClick={handleRegisterWebhook}
                        >
                            Register webhook
                        </Button>
                    </div>

                    <div>
                        <p className="text-sm font-semibold mb-2">Connected platforms</p>
                        {profile.connected_platforms && profile.connected_platforms.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                                {profile.connected_platforms.map((p, idx) => (
                                    <Tag key={idx}>{platformLabel(p)}</Tag>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500">
                                No accounts connected yet — click &quot;Connect accounts&quot; to get started.
                            </p>
                        )}
                    </div>
                </Card>
            )}
        </div>
    )
}

export default AccountsClient
