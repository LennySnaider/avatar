'use client'

import { useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Tag from '@/components/ui/Tag'
import Alert from '@/components/ui/Alert'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { HiOutlineRefresh } from 'react-icons/hi'
import {
    connectTelegramBot,
    disconnectTelegramBot,
    getTelegramWebhookInfo,
} from '@/services/AgentTelegramService'
import type { TelegramBotStatus } from '@/services/AgentTelegramService'
import type { TelegramWebhookInfo } from '@/lib/telegram/client'

interface TelegramConnectionPanelProps {
    avatarId: string
    status: TelegramBotStatus | null
    onStatusChange: (status: TelegramBotStatus | null) => void
    initialWebhookInfo: TelegramWebhookInfo | null
    /** Fórmula construida en `[slug]/page.tsx`, idéntica a la que usa
     *  `connectTelegramBot` — ver esa nota antes de tocar cualquiera de las
     *  dos. */
    expectedWebhookUrl: string
}

/** `last_error_date` de Telegram es epoch en SEGUNDOS (documentado en
 *  `getWebhookInfo`), no milisegundos. */
function formatTelegramDate(epochSeconds: number): string {
    return new Date(epochSeconds * 1000).toLocaleString()
}

const TelegramConnectionPanel = ({
    avatarId,
    status,
    onStatusChange,
    initialWebhookInfo,
    expectedWebhookUrl,
}: TelegramConnectionPanelProps) => {
    const [webhookInfo, setWebhookInfo] = useState<TelegramWebhookInfo | null>(initialWebhookInfo)
    const [isRefreshingWebhook, setIsRefreshingWebhook] = useState(false)

    const [token, setToken] = useState('')
    const [isConnecting, setIsConnecting] = useState(false)

    const [confirmDisconnect, setConfirmDisconnect] = useState(false)
    const [isDisconnecting, setIsDisconnecting] = useState(false)

    const refreshWebhookInfo = async () => {
        setIsRefreshingWebhook(true)
        try {
            const result = await getTelegramWebhookInfo(avatarId)
            if (result.success) {
                setWebhookInfo(result.data ?? null)
            } else {
                toast.push(
                    <Notification type="danger" title="Could not read webhook status">
                        {result.error}
                    </Notification>,
                )
            }
        } finally {
            setIsRefreshingWebhook(false)
        }
    }

    const handleConnect = async () => {
        const trimmed = token.trim()
        if (!trimmed) return
        setIsConnecting(true)
        try {
            const result = await connectTelegramBot(avatarId, trimmed)
            if (result.success && result.data) {
                onStatusChange(result.data)
                // El input se vacía SIEMPRE, éxito o no: el candado de este
                // panel es que el token jamás vuelva a mostrarse — dejarlo en
                // pantalla tras un fallo sería la misma filtración un
                // instante más tarde.
                setToken('')
                toast.push(
                    <Notification type="success" title="Bot connected">
                        @{result.data.botUsername ?? 'unknown'} is now linked to this avatar. This
                        token will not be shown again — if you lose it, generate a new one in
                        BotFather.
                    </Notification>,
                )
                // setWebhook acaba de correr dentro de connectTelegramBot:
                // refrescar para que el diagnóstico de abajo no enseñe el
                // estado ANTERIOR a la conexión.
                await refreshWebhookInfo()
            } else {
                setToken('')
                toast.push(
                    <Notification type="danger" title="Could not connect the bot">
                        {result.error}
                    </Notification>,
                )
            }
        } finally {
            setIsConnecting(false)
        }
    }

    const handleDisconnect = async () => {
        setIsDisconnecting(true)
        try {
            const result = await disconnectTelegramBot(avatarId)
            if (result.success) {
                onStatusChange(result.data ?? null)
                toast.push(<Notification type="success" title="Bot disconnected" />)
            } else {
                toast.push(
                    <Notification type="danger" title="Could not disconnect the bot">
                        {result.error}
                    </Notification>,
                )
            }
        } finally {
            setIsDisconnecting(false)
            setConfirmDisconnect(false)
        }
    }

    const registeredUrl = webhookInfo?.url ?? ''
    const hasNoWebhook = status?.connected === true && registeredUrl === ''
    const webhookMismatch =
        status?.connected === true && registeredUrl !== '' && registeredUrl !== expectedWebhookUrl
    const webhookOk = status?.connected === true && registeredUrl === expectedWebhookUrl

    return (
        <div className="flex flex-col gap-4 max-w-2xl">
            <Card>
                <div className="flex items-center justify-between gap-2 mb-3">
                    <p className="text-sm font-semibold">Bot connection</p>
                    {status?.connected ? (
                        <Tag className="bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-100 border-0">
                            Connected
                        </Tag>
                    ) : status?.botUsername ? (
                        <Tag className="bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-100 border-0">
                            Disconnected
                        </Tag>
                    ) : (
                        <Tag className="bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-100 border-0">
                            Not connected
                        </Tag>
                    )}
                </div>

                {status?.botUsername && (
                    <p className="text-sm mb-3">
                        Bot: <span className="font-semibold">@{status.botUsername}</span>
                    </p>
                )}

                <p className="text-xs text-gray-500 mb-1">
                    {status?.connected ? 'Reconnect with a new token' : 'Bot token'}
                </p>
                <div className="flex items-center gap-2 mb-1">
                    <div className="w-full sm:w-96">
                        <Input
                            type="password"
                            autoComplete="off"
                            size="sm"
                            value={token}
                            placeholder="123456:AAExampleTokenFromBotFather"
                            onChange={(e) => setToken(e.target.value)}
                        />
                    </div>
                    <Button size="sm" variant="solid" loading={isConnecting} onClick={handleConnect}>
                        {status?.connected ? 'Reconnect' : 'Connect'}
                    </Button>
                </div>
                <p className="text-xs text-gray-400 mb-4">
                    Paste the token BotFather gave you when you created the bot. It is stored once
                    and never shown again — not even masked. If you lose it, generate a new one in
                    BotFather and paste it here to reconnect.
                </p>

                {status?.connected && (
                    <div className="flex justify-end">
                        <Button
                            size="sm"
                            variant="plain"
                            customColorClass={() => 'text-red-500 hover:text-red-600'}
                            onClick={() => setConfirmDisconnect(true)}
                        >
                            Disconnect
                        </Button>
                    </div>
                )}
            </Card>

            {status?.connected && (
                <Card>
                    <div className="flex items-center justify-between gap-2 mb-3">
                        <p className="text-sm font-semibold">Webhook status</p>
                        <Button
                            size="xs"
                            icon={<HiOutlineRefresh />}
                            loading={isRefreshingWebhook}
                            onClick={refreshWebhookInfo}
                        >
                            Refresh
                        </Button>
                    </div>

                    {webhookOk && (
                        <Alert type="success" showIcon duration={0}>
                            Telegram is delivering updates to the expected address.
                        </Alert>
                    )}

                    {hasNoWebhook && (
                        <Alert type="danger" showIcon duration={0} title="No webhook registered">
                            Telegram has no delivery address on file for this bot. It is connected
                            but silent — no messages or purchases will arrive. Reconnecting will
                            re-register it.
                        </Alert>
                    )}

                    {webhookMismatch && (
                        <Alert type="danger" showIcon duration={0} title="Webhook points elsewhere">
                            <p className="mb-1">
                                Telegram is delivering updates to a different address than this
                                deployment. This usually happens when the bot was connected from
                                another environment (e.g. a local tunnel) — the bot stays
                                &quot;connected&quot; but never receives anything here.
                            </p>
                            <p className="text-xs mt-2">
                                <span className="font-semibold">Expected:</span> {expectedWebhookUrl}
                            </p>
                            <p className="text-xs">
                                <span className="font-semibold">Registered:</span> {registeredUrl}
                            </p>
                            <p className="text-xs mt-2">
                                Reconnecting from this environment will re-register the correct
                                address.
                            </p>
                        </Alert>
                    )}

                    {webhookInfo?.last_error_message && (
                        <p className="text-xs text-gray-500 mt-3">
                            Telegram&apos;s last delivery error
                            {webhookInfo.last_error_date
                                ? ` (${formatTelegramDate(webhookInfo.last_error_date)})`
                                : ''}
                            : {webhookInfo.last_error_message}
                        </p>
                    )}
                </Card>
            )}

            <ConfirmDialog
                isOpen={confirmDisconnect}
                type="danger"
                title="Disconnect this bot?"
                confirmText="Disconnect"
                confirmButtonProps={{ loading: isDisconnecting, color: 'red' }}
                onClose={() => setConfirmDisconnect(false)}
                onRequestClose={() => setConfirmDisconnect(false)}
                onCancel={() => setConfirmDisconnect(false)}
                onConfirm={handleDisconnect}
            >
                <p>
                    Telegram will stop sending messages and purchases to this app. Paid content
                    already sold is unaffected. You can reconnect the same bot later with a token
                    from BotFather.
                </p>
            </ConfirmDialog>
        </div>
    )
}

export default TelegramConnectionPanel
