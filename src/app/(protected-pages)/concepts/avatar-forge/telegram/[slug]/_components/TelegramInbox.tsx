'use client'

import { useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Avatar from '@/components/ui/Avatar'
import Badge from '@/components/ui/Badge'
import Dialog from '@/components/ui/Dialog'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { HiOutlinePaperAirplane, HiOutlineUser } from 'react-icons/hi'
import { sendPaidMediaFromInbox } from '@/services/AgentTelegramService'
import type { PaidMediaItemView } from '@/services/AgentTelegramService'
import type { TelegramChatListItem, TelegramSaleRow } from './types'

interface TelegramInboxProps {
    avatarId: string
    chats: TelegramChatListItem[]
    /** Lista COMPLETA de la galería (compartida con TelegramGallery vía el
     *  padre) — aquí sólo se ofrecen los habilitados, ver `enabledItems`. */
    items: PaidMediaItemView[]
    botConnected: boolean
    /** El padre antepone esto a la tabla de ventas (Step 5) — mismo estado
     *  'offered' con el que nace la fila en el servidor (paidMedia.ts),
     *  ANTES de que el fan pague. */
    onSaleOffered: (sale: TelegramSaleRow) => void
}

function formatDate(iso: string | null): string {
    if (!iso) return '—'
    return new Date(iso).toLocaleString()
}

const TelegramInbox = ({
    avatarId,
    chats,
    items,
    botConnected,
    onSaleOffered,
}: TelegramInboxProps) => {
    const [activeChat, setActiveChat] = useState<TelegramChatListItem | null>(null)
    const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
    const [starsOverride, setStarsOverride] = useState('')
    const [captionOverride, setCaptionOverride] = useState('')
    const [isSending, setIsSending] = useState(false)

    // Sólo lo habilitado es vendible — mismo criterio que deliverPaidMedia,
    // que rechaza un ítem deshabilitado en el propio servidor; filtrarlo aquí
    // también evita el viaje de red para un envío que sabemos que va a fallar.
    const enabledItems = items.filter((i) => i.enabled)
    const selectedItem = enabledItems.find((i) => i.id === selectedItemId) ?? null

    const pickItem = (item: PaidMediaItemView) => {
        setSelectedItemId(item.id)
        setStarsOverride(String(item.starPrice))
        setCaptionOverride(item.caption ?? '')
    }

    const openSend = (chat: TelegramChatListItem) => {
        setActiveChat(chat)
        const first = enabledItems[0] ?? null
        setSelectedItemId(first?.id ?? null)
        setStarsOverride(first ? String(first.starPrice) : '')
        setCaptionOverride(first?.caption ?? '')
    }

    const handleSend = async () => {
        if (!activeChat || !selectedItem) return
        const stars = Number(starsOverride)
        if (!Number.isInteger(stars) || stars < 1 || stars > 25_000) return

        setIsSending(true)
        try {
            const result = await sendPaidMediaFromInbox({
                avatarId,
                chatId: activeChat.id,
                itemId: selectedItem.id,
                stars,
                caption: captionOverride.trim() || undefined,
            })
            if (result.success && result.data) {
                toast.push(
                    <Notification type="success" title="Content sent">
                        {result.data.stars} Stars offered to{' '}
                        {activeChat.fanDisplayName ?? activeChat.fanHandle ?? 'this fan'}.
                    </Notification>,
                )
                onSaleOffered({
                    id: result.data.saleId,
                    itemTitle: selectedItem.title,
                    stars: result.data.stars,
                    status: 'offered',
                    commissionSettled: false,
                    commissionPct: null,
                    commissionTokens: null,
                    offeredAt: new Date().toISOString(),
                    purchasedAt: null,
                })
                setActiveChat(null)
            } else {
                toast.push(
                    <Notification type="danger" title="Could not send content">
                        {result.error}
                    </Notification>,
                )
            }
        } finally {
            setIsSending(false)
        }
    }

    return (
        <div className="flex flex-col gap-4">
            {!botConnected && (
                <div className="p-2 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg">
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                        This bot isn&apos;t connected — sending paid content will fail until you
                        reconnect it in the Connection tab.
                    </p>
                </div>
            )}

            {chats.length === 0 ? (
                <Card>
                    <p className="text-sm text-gray-500">
                        No Telegram conversations yet — they show up here once a fan messages this
                        bot.
                    </p>
                </Card>
            ) : (
                <Card className="p-0! overflow-hidden">
                    {chats.map((chat, index) => (
                        <div
                            key={chat.id}
                            className={`flex items-center justify-between gap-3 p-3 ${
                                index !== chats.length - 1
                                    ? 'border-b border-gray-100 dark:border-gray-700'
                                    : ''
                            }`}
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                <Avatar src={chat.fanAvatarUrl ?? undefined} icon={<HiOutlineUser />} />
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-semibold truncate">
                                            {chat.fanDisplayName ?? chat.fanHandle ?? 'Unknown fan'}
                                        </span>
                                        {chat.unreadCount > 0 && <Badge content={chat.unreadCount} />}
                                    </div>
                                    <span className="text-xs text-gray-400">
                                        Last message {formatDate(chat.lastMessageAt)}
                                    </span>
                                </div>
                            </div>
                            <Button
                                size="sm"
                                icon={<HiOutlinePaperAirplane />}
                                onClick={() => openSend(chat)}
                            >
                                Send paid content
                            </Button>
                        </div>
                    ))}
                </Card>
            )}

            <Dialog
                isOpen={!!activeChat}
                width={640}
                onClose={() => setActiveChat(null)}
                onRequestClose={() => setActiveChat(null)}
            >
                <h5 className="mb-1">Send paid content</h5>
                <p className="text-xs text-gray-400 mb-4">
                    To {activeChat?.fanDisplayName ?? activeChat?.fanHandle ?? 'this fan'}
                </p>
                {enabledItems.length === 0 ? (
                    <p className="text-sm text-gray-500">
                        No enabled paid content yet — add some in the Gallery tab.
                    </p>
                ) : (
                    <div className="flex flex-col gap-3">
                        <div>
                            <p className="text-xs text-gray-500 mb-1">Pick content</p>
                            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-1">
                                {enabledItems.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => pickItem(item)}
                                        title={item.title}
                                        className={`relative w-16 h-16 shrink-0 rounded-lg overflow-hidden border-2 transition-colors ${
                                            item.id === selectedItemId
                                                ? 'border-primary'
                                                : 'border-transparent hover:border-primary/50'
                                        }`}
                                    >
                                        {item.mediaKind === 'video' ? (
                                            <video
                                                crossOrigin="anonymous"
                                                src={item.mediaUrl}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <img
                                                src={item.mediaUrl}
                                                alt="Content"
                                                className="w-full h-full object-cover"
                                            />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {selectedItem && (
                            <>
                                <p className="text-sm font-semibold">{selectedItem.title}</p>
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">
                                        Price for this send (Stars, 1-25000)
                                    </p>
                                    <Input
                                        type="number"
                                        min={1}
                                        max={25000}
                                        value={starsOverride}
                                        onChange={(e) => setStarsOverride(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">
                                        Caption for this send (optional)
                                    </p>
                                    <Input
                                        textArea
                                        rows={3}
                                        value={captionOverride}
                                        onChange={(e) => setCaptionOverride(e.target.value)}
                                    />
                                </div>
                            </>
                        )}
                    </div>
                )}
                <div className="flex items-center justify-end gap-2 mt-4">
                    <Button variant="plain" onClick={() => setActiveChat(null)} disabled={isSending}>
                        Cancel
                    </Button>
                    <Button
                        variant="solid"
                        loading={isSending}
                        disabled={!selectedItem}
                        onClick={handleSend}
                    >
                        Send
                    </Button>
                </div>
            </Dialog>
        </div>
    )
}

export default TelegramInbox
