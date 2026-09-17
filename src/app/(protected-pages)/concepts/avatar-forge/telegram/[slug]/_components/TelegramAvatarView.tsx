'use client'

import { useState } from 'react'
import Tabs from '@/components/ui/Tabs'
import TelegramConnectionPanel from './TelegramConnectionPanel'
import TelegramGallery from './TelegramGallery'
import TelegramInbox from './TelegramInbox'
import TelegramSalesPanel from './TelegramSalesPanel'
import type { TelegramBotStatus, PaidMediaItemView } from '@/services/AgentTelegramService'
import type { WebhookState } from './TelegramConnectionPanel'
import type { GenerationPickerItem, TelegramChatListItem, TelegramSaleRow } from './types'

const { TabList, TabNav, TabContent } = Tabs

interface TelegramAvatarViewProps {
    avatarId: string
    initialStatus: TelegramBotStatus | null
    initialWebhook: WebhookState
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
    initialWebhook,
    expectedWebhookUrl,
    initialItems,
    generations,
    initialChats,
    initialSales,
    starBalance,
}: TelegramAvatarViewProps) => {
    const [activeTab, setActiveTab] = useState('connection')
    const [status, setStatus] = useState<TelegramBotStatus | null>(initialStatus)
    // Estado de la galería: lo administra la pestaña Gallery y la cabecera lo
    // usa para el contador. La pestaña Conversations ya NO lo recibe — su
    // diálogo de envío (`_shared/TelegramSendContentDialog`, el mismo del
    // Inbox principal) se pide la galería al servidor cada vez que se abre, así
    // que lo que se acabe de dar de alta aquí también sale allí.
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
                        initialWebhook={initialWebhook}
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
