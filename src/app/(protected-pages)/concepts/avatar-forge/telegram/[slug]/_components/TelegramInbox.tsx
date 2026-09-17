'use client'

import { useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Avatar from '@/components/ui/Avatar'
import Badge from '@/components/ui/Badge'
import { HiOutlinePaperAirplane, HiOutlineUser } from 'react-icons/hi'
import TelegramSendContentDialog from '../../../_shared/TelegramSendContentDialog'
import type { TelegramChatListItem, TelegramSaleRow } from './types'

interface TelegramInboxProps {
    avatarId: string
    chats: TelegramChatListItem[]
    botConnected: boolean
    /** El padre antepone esto a la tabla de ventas (Step 5) — mismo estado
     *  'offered' con el que nace la fila en el servidor (paidMedia.ts),
     *  ANTES de que el fan pague. Sólo lo dispara el contenido DE PAGO: un
     *  teaser gratis no crea venta que listar. */
    onSaleOffered: (sale: TelegramSaleRow) => void
}

function formatDate(iso: string | null): string {
    if (!iso) return '—'
    return new Date(iso).toLocaleString()
}

const TelegramInbox = ({ avatarId, chats, botConnected, onSaleOffered }: TelegramInboxProps) => {
    // El formulario de envío es el MISMO que usa el Inbox principal
    // (`_shared/TelegramSendContentDialog`), que además se trae la galería él
    // solo: esta pestaña ya no necesita recibir los ítems por props.
    const [activeChat, setActiveChat] = useState<TelegramChatListItem | null>(null)

    return (
        <div className="flex flex-col gap-4">
            {!botConnected && (
                <div className="p-2 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg">
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                        This bot isn&apos;t connected — sending content will fail until you
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
                                onClick={() => setActiveChat(chat)}
                            >
                                Send content
                            </Button>
                        </div>
                    ))}
                </Card>
            )}

            {activeChat && (
                <TelegramSendContentDialog
                    isOpen
                    avatarId={avatarId}
                    chatId={activeChat.id}
                    fanLabel={activeChat.fanDisplayName ?? activeChat.fanHandle}
                    onClose={() => setActiveChat(null)}
                    onSent={(result) => {
                        if (result.kind !== 'paid') return
                        onSaleOffered({
                            id: result.saleId,
                            itemTitle: result.item.title,
                            stars: result.stars,
                            status: 'offered',
                            commissionSettled: false,
                            commissionPct: null,
                            commissionTokens: null,
                            offeredAt: new Date().toISOString(),
                            purchasedAt: null,
                        })
                    }}
                />
            )}
        </div>
    )
}

export default TelegramInbox
