'use client'

import { useState } from 'react'
import Tabs from '@/components/ui/Tabs'
import TelegramConnectionPanel from './TelegramConnectionPanel'
import TelegramGallery from './TelegramGallery'
import TelegramInbox from './TelegramInbox'
import TelegramSalesPanel from './TelegramSalesPanel'
import type { TelegramBotStatus, PaidMediaItemView } from '@/services/AgentTelegramService'
import type { TelegramWebhookInfo } from '@/lib/telegram/client'
import type { GenerationPickerItem, TelegramChatListItem, TelegramSaleRow } from './types'

const { TabList, TabNav, TabContent } = Tabs

interface TelegramAvatarViewProps {
    avatarId: string
    initialStatus: TelegramBotStatus | null
    initialWebhookInfo: TelegramWebhookInfo | null
    expectedWebhookUrl: string
    initialItems: PaidMediaItemView[]
    generations: GenerationPickerItem[]
    initialChats: TelegramChatListItem[]
    initialSales: TelegramSaleRow[]
    starBalance: number | null
}

const TelegramAvatarView = ({
    avatarId,
    initialStatus,
    initialWebhookInfo,
    expectedWebhookUrl,
    initialItems,
    generations,
    initialChats,
    initialSales,
    starBalance,
}: TelegramAvatarViewProps) => {
    const [activeTab, setActiveTab] = useState('connection')
    const [status, setStatus] = useState<TelegramBotStatus | null>(initialStatus)
    // Compartido entre Gallery (lo administra) e Inbox (lo vende): un ítem
    // creado en una pestaña tiene que poder enviarse desde la otra sin
    // recargar la página — por eso vive aquí y no dentro de cada pestaña.
    const [items, setItems] = useState<PaidMediaItemView[]>(initialItems)
    // Ventas del servidor + lo que esta sesión vaya OFRECIENDO desde Inbox
    // (TelegramInbox antepone la fila en cuanto sendPaidMediaFromInbox
    // confirma el envío — mismo estado 'offered' con el que nace en el
    // servidor, antes de que el fan pague).
    const [sales, setSales] = useState<TelegramSaleRow[]>(initialSales)

    return (
        <Tabs value={activeTab} onChange={(val) => setActiveTab(val as string)}>
            <TabList>
                <TabNav value="connection">Connection</TabNav>
                <TabNav value="gallery">Gallery ({items.length})</TabNav>
                <TabNav value="inbox">Conversations ({initialChats.length})</TabNav>
                <TabNav value="sales">Sales</TabNav>
            </TabList>
            <div className="pt-4">
                <TabContent value="connection">
                    <TelegramConnectionPanel
                        avatarId={avatarId}
                        status={status}
                        onStatusChange={setStatus}
                        initialWebhookInfo={initialWebhookInfo}
                        expectedWebhookUrl={expectedWebhookUrl}
                    />
                </TabContent>
                <TabContent value="gallery">
                    <TelegramGallery
                        avatarId={avatarId}
                        items={items}
                        onItemsChange={setItems}
                        generations={generations}
                    />
                </TabContent>
                <TabContent value="inbox">
                    <TelegramInbox
                        avatarId={avatarId}
                        chats={initialChats}
                        items={items}
                        botConnected={!!status?.connected}
                        onSaleOffered={(sale) => setSales((prev) => [sale, ...prev])}
                    />
                </TabContent>
                <TabContent value="sales">
                    <TelegramSalesPanel sales={sales} starBalance={starBalance} />
                </TabContent>
            </div>
        </Tabs>
    )
}

export default TelegramAvatarView
