'use client'

import { useEffect, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Segment from '@/components/ui/Segment'
import Tag from '@/components/ui/Tag'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import {
    approveAndSend,
    approveAndSendVoiceNote,
    discardDraft,
    getAgentChatThread,
    getChatMedia,
    regenerateDraft,
    removeDraftOffer,
    sendPpvOffer,
    setChatHidden,
    setChatMode,
    suggestPpvOffer,
    type AgentMessageDTO,
    type PpvSuggestion,
} from '@/services/AgentInboxService'
import TelegramSendContentDialog from '../../_shared/TelegramSendContentDialog'
import DiscardReasonDialog from './DiscardReasonDialog'
import MessageMedia, { type ChatMediaState } from './MessageMedia'
import type { DiscardReason } from '@/lib/agent/draftCorrection'
import type { InboxMediaItem } from '@/lib/fanvue/messageMedia'

/**
 * Media de Fanvue por hilo, en memoria mientras vive la página. El hilo se
 * recarga tras cada acción (`onChanged`) y cada vez que se vuelve a un chat:
 * sin esto, cada recarga volvería a pedirle todo a Fanvue. Se invalida
 * cuando llega un mensaje con media nuevo (cambia `key`) o a los 10 minutos,
 * porque las URLs firmadas caducan.
 */
const MEDIA_TTL_MS = 10 * 60 * 1000
const mediaCache = new Map<
    string,
    { at: number; key: string | null; index: Record<string, InboxMediaItem> }
>()

type ThreadData = NonNullable<Awaited<ReturnType<typeof getAgentChatThread>>['data']>

interface ThreadPaneProps {
    thread: ThreadData
    onChanged: () => void
}

/**
 * La etiqueta "Paid offer" de un mensaje, con o sin el botón de quitarla.
 *
 * Estaba escrita dos veces, y las dos copias arrastraban una guarda
 * `status === 'draft'` que no decidía nada: en el historial sólo se pintan
 * mensajes que NO son borrador (siempre falsa — el botón no podía salir
 * nunca), y en el compositor sólo se pinta el borrador (siempre cierta). Quien
 * decide ahora es quien llama: si pasa `onRemove`, hay botón.
 */
const OfferTagShell = ({
    label,
    tone,
    removeLabel,
    className,
    onRemove,
}: {
    label: string
    tone: string
    removeLabel: string
    className?: string
    onRemove?: () => void
}) => (
    <div className={`flex items-center gap-2 text-xs ${className ?? ''}`}>
        <Tag className={`${tone} border-0`}>{label}</Tag>
        {onRemove && (
            <Button size="xs" variant="plain" onClick={onRemove}>
                {removeLabel}
            </Button>
        )}
    </div>
)

const OfferTag = ({
    offer,
    className,
    onRemove,
}: {
    offer: NonNullable<AgentMessageDTO['paidOffer']>
    className?: string
    onRemove?: () => void
}) => (
    <OfferTagShell
        label={`⭐ Paid offer · ${offer.stars} Stars`}
        tone="bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-100"
        removeLabel="Remove offer"
        className={className}
        onRemove={onRemove}
    />
)

/**
 * Lo mismo para el teaser GRATIS que `offerEngine` puede adjuntar a un
 * borrador. Existe porque sin él ese teaser era INVISIBLE: se pegaba al
 * borrador y salía al aprobarlo sin que el creador lo hubiera visto ni
 * pudiera quitarlo — y un teaser se gasta UNA VEZ por fan, así que aprobar a
 * ciegas quema contenido para siempre. Verde y no ámbar a propósito: aquí no
 * se cobra nada, y confundirlo con la oferta de pago es justo lo que hay que
 * evitar.
 */
const FreeOfferTag = ({
    className,
    onRemove,
}: {
    className?: string
    onRemove?: () => void
}) => (
    <OfferTagShell
        label="🎁 Free teaser"
        tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-100"
        removeLabel="Remove teaser"
        className={className}
        onRemove={onRemove}
    />
)

const ThreadPane = ({ thread, onChanged }: ThreadPaneProps) => {
    const { chat, messages, fanMemory, hasVoice } = thread
    const draft = messages.find((m) => m.status === 'draft')
    const conversation = messages.filter((m) => m.status !== 'draft')
    // Qué redacta "Generate draft" (ver `DraftOptions.reengage`): si el
    // último mensaje es del fan, una respuesta; si no, un mensaje para
    // reactivar — primer mensaje si el fan nunca escribió (la bienvenida a un
    // seguidor que no contestó), seguimiento si no contestó al último del
    // avatar. En un comentario público no se reactiva nada.
    const fanHasWritten = conversation.some((m) => m.direction === 'in')
    const lastMessage = conversation[conversation.length - 1]
    const draftKind: 'reply' | 'followup' | 'opener' | 'none' =
        lastMessage?.direction === 'in'
            ? 'reply'
            : chat.channel === 'social_comment'
              ? fanHasWritten
                  ? 'reply'
                  : 'none'
              : fanHasWritten
                ? 'followup'
                : 'opener'
    const DRAFT_COPY: Record<
        typeof draftKind,
        { hint: string; button: string }
    > = {
        reply: {
            hint: 'No draft. Regenerate one, or the agent will draft when the fan writes.',
            button: 'Generate draft',
        },
        followup: {
            hint: "The fan hasn't replied to your last message. Generate a follow-up to re-engage them.",
            button: 'Generate follow-up',
        },
        opener: {
            hint: "The fan hasn't written yet. Generate an opener to start the conversation.",
            button: 'Generate opener',
        },
        none: { hint: 'Nothing to reply to yet.', button: 'Generate draft' },
    }

    // Acciones que sólo hablan Fanvue (nota de voz por TTS, PPV con precio en
    // centavos). En un chat de Telegram o de comentarios sociales no pueden
    // funcionar, así que tampoco se enseñan: el servicio las rechaza
    // igualmente, pero un botón que siempre falla es una promesa falsa.
    // Task 7 — antes esto miraba sólo `chat.platform.startsWith('telegram')`
    // (y se llamaba `isTelegram`), así que un chat `social:*` (que tampoco es
    // Fanvue) se colaba de largo y mostraba Voice note / Suggest PPV igual
    // que un chat de Fanvue real, ambos condenados a fallar del lado del
    // servicio (mismo corte que ya usa `AgentInboxService` en
    // `approveAndSendVoiceNote`/`suggestPpvOffer`). El nombre nuevo dice lo
    // que la condición hace hoy: ocultar lo que sólo existe en Fanvue.
    const hideFanvueOnlyTools = chat.channel !== 'fanvue'

    // Lo simétrico para Telegram: mandar una foto de la galería (teaser gratis
    // o contenido de pago con Stars) sólo existe en ese canal. Vive AQUÍ, en el
    // hilo, y no sólo en el panel de Telegram, porque es donde se está leyendo
    // al fan cuando se decide mandarle algo (feedback del usuario 17-sep: "el
    // Inbox manda"). El diálogo es el mismo componente compartido que usa la
    // pestaña Conversations de ese panel.
    const isTelegramChat = chat.channel === 'telegram'
    const [sendContentOpen, setSendContentOpen] = useState(false)

    // Comentario en un post social: cabecera con la red, el caption y el
    // enlace al post original. Sólo los chats `social:*` traen `context`.
    const captionPreview =
        chat.context?.caption && chat.context.caption.length > 120
            ? `${chat.context.caption.slice(0, 120)}…`
            : (chat.context?.caption ?? null)
    const socialLabel = chat.socialPlatform
        ? `${chat.socialPlatform.charAt(0).toUpperCase()}${chat.socialPlatform.slice(1)}`
        : 'social'

    const [draftText, setDraftText] = useState(draft?.text ?? '')
    const [busy, setBusy] = useState<
        'send' | 'voice' | 'regen' | 'discard' | 'removeOffer' | 'hide' | null
    >(null)
    const [showMemory, setShowMemory] = useState(false)
    const [discardOpen, setDiscardOpen] = useState(false)

    // Fotos y vídeos del hilo: UNA petición por chat (`getChatMedia`), no una
    // por mensaje. `mediaKey` es el último mensaje con media: si cambia, llegó
    // media nueva y la caché ya no la tiene.
    const mediaKey =
        [...messages].reverse().find((m) => m.mediaUuids.length > 0)?.id ?? null
    const wantsMedia = !hideFanvueOnlyTools && mediaKey !== null
    const [media, setMedia] = useState<ChatMediaState>({ kind: 'loading' })
    const mediaChatRef = useRef(chat.id)
    const mediaRetried = useRef(false)

    const loadMedia = async (force: boolean) => {
        const chatId = chat.id
        mediaChatRef.current = chatId
        const hit = mediaCache.get(chatId)
        if (
            !force &&
            hit &&
            hit.key === mediaKey &&
            Date.now() - hit.at < MEDIA_TTL_MS
        ) {
            setMedia({ kind: 'ready', index: hit.index })
            return
        }
        setMedia({ kind: 'loading' })
        const result = await getChatMedia(chatId)
        // Se cambió de chat mientras tanto: esta respuesta ya no es de este hilo.
        if (mediaChatRef.current !== chatId) return
        if (result.success) {
            const index = result.data ?? {}
            mediaCache.set(chatId, { at: Date.now(), key: mediaKey, index })
            setMedia({ kind: 'ready', index })
        } else {
            setMedia({
                kind: 'error',
                message: result.error ?? 'Could not load media',
            })
        }
    }

    useEffect(() => {
        mediaRetried.current = false
        if (wantsMedia) loadMedia(false)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chat.id, mediaKey, wantsMedia])

    // Una imagen no cargó: casi siempre, URL firmada caducada. Se pide la
    // media otra vez, UNA sola vez por hilo (si no, un medio roto de verdad
    // entraría en bucle).
    const onMediaBroken = () => {
        if (mediaRetried.current) return
        mediaRetried.current = true
        loadMedia(true)
    }

    // PPV offer state
    const [ppv, setPpv] = useState<PpvSuggestion | null>(null)
    const [ppvPrice, setPpvPrice] = useState('')
    const [isSuggestingPpv, setIsSuggestingPpv] = useState(false)
    const [isSendingPpv, setIsSendingPpv] = useState(false)

    const handleSuggestPpv = async () => {
        setIsSuggestingPpv(true)
        try {
            const result = await suggestPpvOffer(chat.id)
            if (result.success && result.data) {
                setPpv(result.data)
                setPpvPrice(String((result.data.priceCents / 100).toFixed(2)))
            } else {
                toast.push(
                    <Notification type="danger" title="No PPV suggestion">
                        {result.error}
                    </Notification>,
                )
            }
        } finally {
            setIsSuggestingPpv(false)
        }
    }

    const handleSendPpv = async () => {
        if (!ppv) return
        const cents = Math.round(Number(ppvPrice) * 100)
        if (!Number.isFinite(cents) || cents < 300) {
            toast.push(
                <Notification type="danger" title="Invalid price">
                    Minimum is $3.00
                </Notification>,
            )
            return
        }
        setIsSendingPpv(true)
        try {
            const result = await sendPpvOffer({
                chatId: chat.id,
                storagePath: ppv.storagePath,
                mediaType: ppv.mediaType,
                text: ppv.teaser,
                priceCents: cents,
            })
            if (result.success) {
                toast.push(
                    <Notification type="success" title="PPV sent">
                        Locked content sent for ${(cents / 100).toFixed(2)}
                    </Notification>,
                )
                setPpv(null)
                onChanged()
            } else {
                toast.push(
                    <Notification type="danger" title="PPV failed">
                        {result.error}
                    </Notification>,
                )
            }
        } finally {
            setIsSendingPpv(false)
        }
    }

    useEffect(() => {
        setDraftText(draft?.text ?? '')
    }, [draft?.id, draft?.text])

    const handleMode = async (mode: string) => {
        const result = await setChatMode(chat.id, mode as 'off' | 'draft' | 'auto')
        if (result.success) onChanged()
        else
            toast.push(
                <Notification type="danger" title="Failed">
                    {result.error}
                </Notification>,
            )
    }

    // Fanvue no marca como creadoras a las cuentas que spamean con mensajes
    // masivos: el humano las esconde aquí (ver `setChatHidden`). Al ocultarlo
    // desaparece de la lista; se recupera desde "Show other-creator / spam".
    const handleHidden = async () => {
        const hide = !chat.isCreator
        setBusy('hide')
        try {
            const result = await setChatHidden(chat.id, hide)
            if (result.success) {
                toast.push(
                    <Notification
                        type="success"
                        title={hide ? 'Hidden' : 'Unhidden'}
                    >
                        {hide
                            ? 'Moved to other-creator / spam chats. The agent stops drafting here.'
                            : 'Back in the inbox. The chat stays Off until you switch it on.'}
                    </Notification>,
                )
                onChanged()
            } else {
                toast.push(
                    <Notification type="danger" title="Failed">
                        {result.error}
                    </Notification>,
                )
            }
        } finally {
            setBusy(null)
        }
    }

    const handleApprove = async () => {
        if (!draft) return
        setBusy('send')
        try {
            const result = await approveAndSend(draft.id, draftText.trim())
            if (result.success) {
                toast.push(
                    <Notification type="success" title="Sent">
                        Reply sent as {chat.avatarName ?? 'the avatar'}
                    </Notification>,
                )
                onChanged()
            } else {
                toast.push(
                    <Notification type="danger" title="Send failed">
                        {result.error}
                    </Notification>,
                )
            }
        } finally {
            setBusy(null)
        }
    }

    const handleVoiceNote = async () => {
        if (!draft) return
        setBusy('voice')
        try {
            const result = await approveAndSendVoiceNote(draft.id, draftText.trim())
            if (result.success) {
                toast.push(
                    <Notification type="success" title="Voice note sent">
                        Sent in {chat.avatarName ?? 'the avatar'}&apos;s voice
                    </Notification>,
                )
                onChanged()
            } else {
                toast.push(
                    <Notification type="danger" title="Voice note failed">
                        {result.error}
                    </Notification>,
                )
            }
        } finally {
            setBusy(null)
        }
    }

    const handleRegenerate = async () => {
        setBusy('regen')
        try {
            const result = await regenerateDraft(chat.id)
            if (result.success && result.data) {
                setDraftText(result.data.text ?? '')
                onChanged()
            } else {
                toast.push(
                    <Notification type="danger" title="Could not regenerate">
                        {result.error}
                    </Notification>,
                )
            }
        } finally {
            setBusy(null)
        }
    }

    const handleDiscard = async (reason: DiscardReason, note?: string) => {
        if (!draft) return
        setBusy('discard')
        try {
            // El resultado se mira: antes se ignoraba, así que un descarte que
            // fallaba en el servidor se veía igual que uno que funcionó y el
            // borrador reaparecía al recargar sin explicación.
            const result = await discardDraft(draft.id, reason, note)
            if (result.success) {
                setDiscardOpen(false)
                onChanged()
            } else {
                toast.push(
                    <Notification type="danger" title="Could not discard">
                        {result.error}
                    </Notification>,
                )
            }
        } finally {
            setBusy(null)
        }
    }

    const handleRemoveOffer = async (messageId: string) => {
        setBusy('removeOffer')
        try {
            const result = await removeDraftOffer(messageId)
            if (result.success) {
                onChanged()
            } else {
                toast.push(
                    <Notification type="danger" title="Could not remove offer">
                        {result.error}
                    </Notification>,
                )
            }
        } finally {
            setBusy(null)
        }
    }

    const factEntries = Object.entries(fanMemory?.facts ?? {})

    return (
        <div className="flex flex-col h-full min-h-0 lg:flex-1">
            {/* Header */}
            <div className="p-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between gap-2">
                <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">
                        {chat.fanDisplayName ?? chat.fanHandle ?? 'Fan'}
                        {chat.avatarName && (
                            <span className="text-xs text-primary font-medium ml-2">
                                ↔ {chat.avatarName}
                            </span>
                        )}
                    </p>
                    {(fanMemory?.summary || factEntries.length > 0) && (
                        <button
                            type="button"
                            className="text-[11px] text-gray-400 underline"
                            onClick={() => setShowMemory((s) => !s)}
                        >
                            {showMemory ? 'Hide' : 'Show'} what the agent remembers
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Button
                        size="xs"
                        variant="plain"
                        loading={busy === 'hide'}
                        disabled={busy !== null}
                        onClick={handleHidden}
                    >
                        {chat.isCreator ? 'Unhide' : 'Hide as spam'}
                    </Button>
                    <Segment value={chat.mode} onChange={(val) => handleMode(val as string)}>
                        <Segment.Item value="off">Off</Segment.Item>
                        <Segment.Item value="draft">Draft</Segment.Item>
                        <Segment.Item value="auto">Auto</Segment.Item>
                    </Segment>
                </div>
            </div>

            {chat.context && (
                <div className="p-2 bg-violet-50 dark:bg-violet-900/20 border-b border-violet-200 dark:border-violet-800 flex items-center justify-between gap-2">
                    <p
                        className="text-xs text-violet-700 dark:text-violet-200 truncate"
                        title={chat.context.caption ?? undefined}
                    >
                        Comment on your {socialLabel} post
                        {captionPreview ? `: “${captionPreview}”` : ''}
                    </p>
                    {chat.context.postUrl && (
                        <a
                            href={chat.context.postUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0"
                        >
                            <Button size="xs" variant="plain">
                                Open post
                            </Button>
                        </a>
                    )}
                </div>
            )}

            {chat.needsAttention && (
                <div className="p-2 bg-red-50 dark:bg-red-900/30 border-b border-red-200 dark:border-red-700">
                    <p className="text-xs text-red-600 dark:text-red-400">
                        ⚠ Autopilot paused on this chat: {chat.attentionReason ?? 'needs your attention'}.
                        Approving a reply clears this.
                    </p>
                </div>
            )}

            {showMemory && (fanMemory?.summary || factEntries.length > 0) && (
                <div className="p-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700 text-xs">
                    {fanMemory?.summary && <p className="mb-1 italic">{fanMemory.summary}</p>}
                    {factEntries.length > 0 && (
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-gray-500">
                            {factEntries.map(([k, v]) => (
                                <span key={k}>
                                    <span className="font-medium">{k}:</span> {String(v)}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Messages */}
            <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2 max-h-[45vh] lg:max-h-none">
                {conversation.length === 0 && (
                    <p className="text-sm text-gray-400">No messages yet.</p>
                )}
                {conversation.map((m: AgentMessageDTO) => {
                    // Un mensaje de sólo foto no trae texto: antes salía como
                    // una burbuja vacía. La burbuja queda para el texto (o el
                    // fallo), y lo que no tenga ni texto ni media la conserva.
                    const hasMedia =
                        !hideFanvueOnlyTools && m.mediaUuids.length > 0
                    const showBubble =
                        Boolean(m.text) || m.status === 'failed' || !hasMedia
                    return (
                        <div
                            key={m.id}
                            className={`flex flex-col ${m.direction === 'out' ? 'items-end' : 'items-start'}`}
                        >
                            {hasMedia && (
                                <MessageMedia
                                    uuids={m.mediaUuids}
                                    media={media}
                                    align={
                                        m.direction === 'out' ? 'end' : 'start'
                                    }
                                    onBroken={onMediaBroken}
                                    onRetry={() => loadMedia(true)}
                                />
                            )}
                            {showBubble && (
                                <div
                                    className={`px-3 py-2 rounded-2xl max-w-[80%] text-sm whitespace-pre-wrap ${
                                        m.direction === 'out'
                                            ? 'bg-primary text-white rounded-br-sm'
                                            : 'bg-gray-100 dark:bg-gray-700 rounded-bl-sm'
                                    }`}
                                >
                                    {m.text}
                                    {m.status === 'failed' && (
                                        <span className="block text-[10px] text-red-200 mt-1">
                                            failed: {m.errorMessage}
                                        </span>
                                    )}
                                </div>
                            )}
                            {m.paidOffer && <OfferTag offer={m.paidOffer} className="mt-1" />}
                            {m.freeOffer && <FreeOfferTag className="mt-1" />}
                        </div>
                    )
                })}
            </div>

            {/* PPV offer suggestion */}
            {ppv && !hideFanvueOnlyTools && (
                <div className="p-3 border-t border-primary/30 bg-primary/5">
                    <div className="flex items-start gap-3">
                        <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-700 shrink-0 relative">
                            {ppv.mediaType === 'VIDEO' ? (
                                <video src={ppv.previewUrl} crossOrigin="anonymous" className="w-full h-full object-cover blur-sm" />
                            ) : (
                                <img src={ppv.previewUrl} alt="" className="w-full h-full object-cover blur-sm" />
                            )}
                            <span className="absolute inset-0 flex items-center justify-center text-white text-lg">🔒</span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-primary mb-1">PPV offer</p>
                            <Input
                                textArea
                                rows={2}
                                value={ppv.teaser}
                                onChange={(e) => setPpv({ ...ppv, teaser: e.target.value })}
                            />
                            <div className="flex items-center gap-2 mt-2">
                                <span className="text-xs text-gray-500">Price $</span>
                                <div className="w-24">
                                    <Input
                                        size="sm"
                                        type="number"
                                        value={ppvPrice}
                                        onChange={(e) => setPpvPrice(e.target.value)}
                                    />
                                </div>
                                <Button
                                    variant="solid"
                                    size="sm"
                                    loading={isSendingPpv}
                                    onClick={handleSendPpv}
                                >
                                    Send PPV
                                </Button>
                                <Button size="sm" variant="plain" onClick={() => setPpv(null)}>
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Draft composer */}
            <div className="p-3 border-t border-gray-100 dark:border-gray-700">
                {/* Acciones del canal Telegram — FUERA del bloque del borrador
                    a propósito: mandar una foto no depende de que el agente
                    tenga una respuesta escrita (y con `auto` puede no haberla
                    nunca). */}
                {isTelegramChat && (
                    <div className="flex items-center justify-end mb-2">
                        <Button
                            size="sm"
                            variant="plain"
                            onClick={() => setSendContentOpen(true)}
                            title="Send a free teaser or Stars-locked content from this avatar's Telegram gallery"
                        >
                            📷 Send content
                        </Button>
                    </div>
                )}
                {draft ? (
                    <>
                        <div className="flex items-center justify-between mb-1">
                            <p className="text-xs font-semibold text-primary">Agent draft</p>
                            {draft.generatedBy?.model && (
                                <span className="text-[10px] text-gray-400">
                                    {draft.generatedBy.provider} · {draft.generatedBy.model}
                                </span>
                            )}
                        </div>
                        {draft.paidOffer && (
                            <OfferTag
                                offer={draft.paidOffer}
                                className="mb-2"
                                onRemove={() => handleRemoveOffer(draft.id)}
                            />
                        )}
                        {draft.freeOffer && (
                            <FreeOfferTag
                                className="mb-2"
                                onRemove={() => handleRemoveOffer(draft.id)}
                            />
                        )}
                        <Input
                            textArea
                            rows={3}
                            value={draftText}
                            onChange={(e) => setDraftText(e.target.value)}
                        />
                        <div className="flex items-center gap-2 mt-2">
                            <Button
                                variant="solid"
                                size="sm"
                                loading={busy === 'send'}
                                disabled={!draftText.trim() || busy !== null}
                                onClick={handleApprove}
                            >
                                Approve &amp; Send
                            </Button>
                            {hasVoice && !hideFanvueOnlyTools && (
                                <Button
                                    size="sm"
                                    loading={busy === 'voice'}
                                    disabled={!draftText.trim() || busy !== null}
                                    onClick={handleVoiceNote}
                                    title="Send this reply as a voice note in the avatar's cloned voice"
                                >
                                    🎙 Voice note
                                </Button>
                            )}
                            <Button
                                size="sm"
                                loading={busy === 'regen'}
                                disabled={busy !== null}
                                onClick={handleRegenerate}
                            >
                                Regenerate
                            </Button>
                            <Button
                                variant="plain"
                                size="sm"
                                loading={busy === 'discard'}
                                disabled={busy !== null}
                                onClick={() => setDiscardOpen(true)}
                            >
                                Discard
                            </Button>
                            {!hideFanvueOnlyTools && (
                                <Button
                                    variant="plain"
                                    size="sm"
                                    loading={isSuggestingPpv}
                                    disabled={busy !== null || !!ppv}
                                    onClick={handleSuggestPpv}
                                    className="ml-auto"
                                    title="Suggest a pay-per-view offer from this avatar's content"
                                >
                                    💰 Suggest PPV
                                </Button>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-gray-400">
                            {DRAFT_COPY[draftKind].hint}
                        </p>
                        <Button
                            size="sm"
                            loading={busy === 'regen'}
                            disabled={busy !== null || draftKind === 'none'}
                            onClick={handleRegenerate}
                        >
                            {DRAFT_COPY[draftKind].button}
                        </Button>
                    </div>
                )}
            </div>

            <DiscardReasonDialog
                isOpen={discardOpen}
                busy={busy === 'discard'}
                onClose={() => setDiscardOpen(false)}
                onConfirm={handleDiscard}
            />

            {isTelegramChat && sendContentOpen && (
                <TelegramSendContentDialog
                    isOpen
                    avatarId={chat.avatarId}
                    chatId={chat.id}
                    fanLabel={chat.fanDisplayName ?? chat.fanHandle}
                    onClose={() => setSendContentOpen(false)}
                    // Mismo refresco que cualquier otra acción que escribe en
                    // el hilo (`approveAndSend`, PPV): el envío deja un
                    // `agent_messages` saliente que el padre tiene que releer.
                    onSent={() => onChanged()}
                />
            )}
        </div>
    )
}

export default ThreadPane
