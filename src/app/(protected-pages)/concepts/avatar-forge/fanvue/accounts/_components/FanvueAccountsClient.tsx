'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Avatar from '@/components/ui/Avatar'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Tag from '@/components/ui/Tag'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import {
    syncCreators,
    type FanvueConnectionSummary,
    type FanvueCreatorRow,
} from '@/services/FanvueService'

interface FanvueAccountsClientProps {
    initialConnection: FanvueConnectionSummary | null
    initialCreators: FanvueCreatorRow[]
    loadError: string | null
}

const ACCOUNTS_PATH = '/concepts/avatar-forge/fanvue/accounts'

const FanvueAccountsClient = ({
    initialConnection,
    initialCreators,
    loadError,
}: FanvueAccountsClientProps) => {
    const [connection] = useState<FanvueConnectionSummary | null>(
        initialConnection,
    )
    const [creators, setCreators] =
        useState<FanvueCreatorRow[]>(initialCreators)
    const [error, setError] = useState<string | null>(loadError)
    const [isBusy, setIsBusy] = useState(false)
    const router = useRouter()
    const searchParams = useSearchParams()
    const handledConnectParams = useRef(false)

    const isConnected = !!connection?.connected

    const handleConnect = () => {
        window.open('/api/fanvue/connect', '_blank', 'width=600,height=760')
    }

    const handleRefresh = async () => {
        setIsBusy(true)
        setError(null)
        try {
            const result = await syncCreators()
            if (result.success) {
                setCreators(result.data ?? [])
            } else {
                setError(result.error ?? 'Failed to refresh managed creators')
            }
        } finally {
            setIsBusy(false)
        }
    }

    // Reflect `?connected=1` / `?error=...` set by the connect/callback routes.
    // Runs once on mount, then strips the params so a refresh doesn't re-trigger.
    useEffect(() => {
        if (handledConnectParams.current) return
        const connected = searchParams.get('connected')
        const connectError = searchParams.get('error')
        if (!connected && !connectError) return
        handledConnectParams.current = true

        if (connected === '1') {
            handleRefresh()
            toast.push(
                <Notification type="success" title="Fanvue connected">
                    Syncing your managed creators
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
                    <p className="text-xs text-red-600 dark:text-red-400">
                        {error}
                    </p>
                </div>
            )}

            <Card>
                <div className="flex flex-wrap items-center gap-2 mb-4">
                    <Button
                        variant="solid"
                        disabled={isBusy}
                        onClick={handleConnect}
                    >
                        {isConnected ? 'Reconnect agency' : 'Connect agency'}
                    </Button>
                    <Button
                        loading={isBusy}
                        disabled={!isConnected}
                        onClick={handleRefresh}
                    >
                        Refresh creators
                    </Button>
                    <Tag
                        className={
                            isConnected
                                ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-100 border-0'
                                : 'bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-100 border-0'
                        }
                    >
                        {isConnected ? 'Connected' : 'Not connected'}
                    </Tag>
                </div>

                <div>
                    <p className="text-sm font-semibold mb-2">
                        Managed creators
                    </p>
                    {creators.length > 0 ? (
                        <div className="flex flex-col gap-2">
                            {creators.map((creator) => (
                                <div
                                    key={creator.id}
                                    className="flex items-center gap-3"
                                >
                                    <Avatar
                                        size={32}
                                        shape="circle"
                                        src={creator.avatar_url ?? undefined}
                                    >
                                        {(
                                            creator.display_name ??
                                            creator.handle ??
                                            '?'
                                        )
                                            .charAt(0)
                                            .toUpperCase()}
                                    </Avatar>
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium truncate">
                                            {creator.display_name ??
                                                creator.handle ??
                                                creator.creator_user_uuid}
                                        </p>
                                        {creator.handle && (
                                            <p className="text-xs text-gray-400 truncate">
                                                @{creator.handle}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-gray-500">
                            {isConnected
                                ? 'No creators found yet — click "Refresh creators" to sync your agency.'
                                : 'Connect your Fanvue agency to load the creators you manage.'}
                        </p>
                    )}
                </div>
            </Card>
        </div>
    )
}

export default FanvueAccountsClient
