'use client'

import { useEffect, useState } from 'react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Segment from '@/components/ui/Segment'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import {
    approveAndSend,
    approveAndSendVoiceNote,
    discardDraft,
    getAgentChatThread,
    regenerateDraft,
    sendPpvOffer,
    setChatMode,
    suggestPpvOffer,
    type AgentMessageDTO,
    type PpvSuggestion,
} from '@/services/AgentInboxService'

type ThreadData = NonNullable<Awaited<ReturnType<typeof getAgentChatThread>>['data']>

interface ThreadPaneProps {
    thread: ThreadData
    onChanged: () => void
}

const ThreadPane = ({ thread, onChanged }: ThreadPaneProps) => {
    const { chat, messages, fanMemory, hasVoice } = thread
    const draft = messages.find((m) => m.status === 'draft')
    const conversation = messages.filter((m) => m.status !== 'draft')

    const [draftText, setDraftText] = useState(draft?.text ?? '')
    const [busy, setBusy] = useState<'send' | 'voice' | 'regen' | 'discard' | null>(null)
    const [showMemory, setShowMemory] = useState(false)

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

    const handleDiscard = async () => {
        if (!draft) return
        setBusy('discard')
        try {
            await discardDraft(draft.id)
            onChanged()
        } finally {
            setBusy(null)
        }
    }

    const factEntries = Object.entries(fanMemory?.facts ?? {})

    return (
        <div className="flex flex-col h-full">
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
                <Segment value={chat.mode} onChange={(val) => handleMode(val as string)}>
                    <Segment.Item value="off">Off</Segment.Item>
                    <Segment.Item value="draft">Draft</Segment.Item>
                    <Segment.Item value="auto">Auto</Segment.Item>
                </Segment>
            </div>

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
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 max-h-[45vh]">
                {conversation.length === 0 && (
                    <p className="text-sm text-gray-400">No messages yet.</p>
                )}
                {conversation.map((m: AgentMessageDTO) => (
                    <div
                        key={m.id}
                        className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}
                    >
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
                    </div>
                ))}
            </div>

            {/* PPV offer suggestion */}
            {ppv && (
                <div className="p-3 border-t border-primary/30 bg-primary/5">
                    <div className="flex items-start gap-3">
                        <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-700 shrink-0 relative">
                            {ppv.mediaType === 'VIDEO' ? (
                                <video src={ppv.previewUrl} className="w-full h-full object-cover blur-sm" />
                            ) : (
                                // eslint-disable-next-line @next/next/no-img-element
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
                            {hasVoice && (
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
                                onClick={handleDiscard}
                            >
                                Discard
                            </Button>
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
                        </div>
                    </>
                ) : (
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-gray-400">
                            No draft. Regenerate one, or the agent will draft when the fan writes.
                        </p>
                        <Button
                            size="sm"
                            loading={busy === 'regen'}
                            disabled={busy !== null}
                            onClick={handleRegenerate}
                        >
                            Generate draft
                        </Button>
                    </div>
                )}
            </div>
        </div>
    )
}

export default ThreadPane
