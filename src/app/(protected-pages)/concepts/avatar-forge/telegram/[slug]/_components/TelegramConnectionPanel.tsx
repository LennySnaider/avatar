'use client'

import { useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Tag from '@/components/ui/Tag'
import Alert from '@/components/ui/Alert'
import Switcher from '@/components/ui/Switcher'
import Segment from '@/components/ui/Segment'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { HiOutlineRefresh } from 'react-icons/hi'
import {
    connectTelegramBot,
    disconnectTelegramBot,
    getTelegramWebhookInfo,
    updateTelegramAiSettings,
} from '@/services/AgentTelegramService'
import type { TelegramBotStatus, TelegramAiSettingsPatch } from '@/services/AgentTelegramService'
import type { TelegramWebhookInfo } from '@/lib/telegram/client'

/**
 * Lo que esta pantalla sabe del webhook AHORA MISMO.
 *
 * `unknown` es el estado que faltaba y por el que existe este tipo: significa
 * "no he conseguido preguntárselo a Telegram", que no es lo mismo que "no hay
 * webhook". Antes ambas cosas eran `null` y se pintaban como la segunda.
 */
export type WebhookState =
    | { status: 'unknown'; error: string | null }
    | { status: 'no_bot' }
    | { status: 'answered'; info: TelegramWebhookInfo }

interface TelegramConnectionPanelProps {
    avatarId: string
    status: TelegramBotStatus | null
    onStatusChange: (status: TelegramBotStatus | null) => void
    initialWebhook: WebhookState
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
    initialWebhook,
    expectedWebhookUrl,
}: TelegramConnectionPanelProps) => {
    const [webhook, setWebhook] = useState<WebhookState>(initialWebhook)
    const [isRefreshingWebhook, setIsRefreshingWebhook] = useState(false)

    const [token, setToken] = useState('')
    const [isConnecting, setIsConnecting] = useState(false)

    const [confirmDisconnect, setConfirmDisconnect] = useState(false)
    const [isDisconnecting, setIsDisconnecting] = useState(false)

    const [savingAi, setSavingAi] = useState<keyof TelegramAiSettingsPatch | null>(null)

    const refreshWebhookInfo = async () => {
        setIsRefreshingWebhook(true)
        // Se borra lo que sabíamos ANTES de preguntar. Si no, durante el viaje de
        // ida y vuelta la tarjeta seguiría afirmando el estado anterior — que es
        // justo lo que pasó al conectar: `status.connected` ya era `true` y el
        // webhook todavía era el de antes de existir el bot.
        setWebhook({ status: 'unknown', error: null })
        try {
            const result = await getTelegramWebhookInfo(avatarId)
            if (result.success && result.data) {
                setWebhook(
                    result.data.state === 'no_bot'
                        ? { status: 'no_bot' }
                        : { status: 'answered', info: result.data.info },
                )
            } else {
                const error = result.success ? 'Telegram devolvió una respuesta vacía.' : result.error
                setWebhook({ status: 'unknown', error: error ?? null })
                toast.push(
                    <Notification type="danger" title="Could not read webhook status">
                        {error}
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

    const saveAi = async (patch: TelegramAiSettingsPatch) => {
        const key = Object.keys(patch)[0] as keyof TelegramAiSettingsPatch
        setSavingAi(key)
        try {
            const result = await updateTelegramAiSettings(avatarId, patch)
            if (result.success && result.data) {
                onStatusChange(result.data)
            } else {
                toast.push(
                    <Notification type="danger" title="Could not save AI settings">
                        {result.success ? 'Empty response.' : result.error}
                    </Notification>,
                )
            }
        } finally {
            setSavingAi(null)
        }
    }

    const answeredUrl = webhook.status === 'answered' ? webhook.info.url : null
    // `isRefreshingWebhook` va DELANTE de todo: mientras preguntamos no
    // afirmamos nada.
    const webhookChecking = status?.connected === true && isRefreshingWebhook
    const webhookUnknown =
        status?.connected === true && !isRefreshingWebhook && webhook.status !== 'answered'
    const hasNoWebhook = status?.connected === true && !isRefreshingWebhook && answeredUrl === ''
    const webhookMismatch =
        status?.connected === true &&
        !isRefreshingWebhook &&
        answeredUrl !== null &&
        answeredUrl !== '' &&
        answeredUrl !== expectedWebhookUrl
    const webhookOk =
        status?.connected === true && !isRefreshingWebhook && answeredUrl === expectedWebhookUrl

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

                    {webhookChecking && (
                        <Alert type="info" showIcon duration={0}>
                            Checking with Telegram…
                        </Alert>
                    )}

                    {webhookUnknown && (
                        <Alert type="warning" showIcon duration={0} title="Couldn't check the webhook">
                            <p className="mb-1">
                                We could not ask Telegram where it delivers updates for this bot, so we
                                don&apos;t know whether it is registered. This says nothing about the bot
                                itself — it may well be working.
                            </p>
                            {webhook.status === 'unknown' && webhook.error && (
                                <p className="text-xs mt-2">
                                    <span className="font-semibold">Reason:</span> {webhook.error}
                                </p>
                            )}
                        </Alert>
                    )}

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
                                <span className="font-semibold">Registered:</span> {answeredUrl ?? ''}
                            </p>
                            <p className="text-xs mt-2">
                                Reconnecting from this environment will re-register the correct
                                address.
                            </p>
                        </Alert>
                    )}

                    {webhook.status === 'answered' && webhook.info.last_error_message && (
                        <p className="text-xs text-gray-500 mt-3">
                            Telegram&apos;s last delivery error
                            {webhook.info.last_error_date
                                ? ` (${formatTelegramDate(webhook.info.last_error_date)})`
                                : ''}
                            : {webhook.info.last_error_message}
                        </p>
                    )}
                </Card>
            )}

            {status?.connected && (
                <Card>
                    <p className="text-sm font-semibold mb-1">AI on Telegram</p>
                    <p className="text-xs text-gray-500 mb-4">
                        This switch is independent from &quot;Agent enabled&quot; on the AI Agent page,
                        which only gates the Fanvue inbox. Turn the AI on here and off there to reply
                        on Telegram only.
                    </p>

                    <div className="flex items-center justify-between gap-3 mb-4">
                        <div>
                            <p className="text-sm">AI replies</p>
                            <p className="text-xs text-gray-400">
                                The persona drafts a reply to every fan message that arrives through
                                the bot.
                            </p>
                        </div>
                        <Switcher
                            checked={status.aiRepliesEnabled}
                            isLoading={savingAi === 'aiRepliesEnabled'}
                            onChange={(checked) => saveAi({ aiRepliesEnabled: checked })}
                        />
                    </div>

                    <div className="mb-4">
                        <p className="text-sm mb-1">New chats start in</p>
                        <p className="text-xs text-gray-400 mb-2">
                            Auto sends by itself after the risk check and Autopilot rules (schedule,
                            delays, daily limit). Draft leaves a reply for you to approve. Existing
                            chats keep their own mode — change it from the inbox.
                        </p>
                        <Segment
                            value={status.aiDefaultChatMode}
                            onChange={(val) => saveAi({ aiDefaultChatMode: val as 'auto' | 'draft' })}
                        >
                            <Segment.Item value="auto">Auto</Segment.Item>
                            <Segment.Item value="draft">Draft</Segment.Item>
                        </Segment>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-sm">Let the AI offer paid content</p>
                            <p className="text-xs text-gray-400">
                                When the conversation warms up, the AI may attach an item from your
                                gallery. Sales closed this way count as AI sales.
                            </p>
                        </div>
                        <Switcher
                            checked={status.aiOffersEnabled}
                            isLoading={savingAi === 'aiOffersEnabled'}
                            onChange={(checked) => saveAi({ aiOffersEnabled: checked })}
                        />
                    </div>
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
