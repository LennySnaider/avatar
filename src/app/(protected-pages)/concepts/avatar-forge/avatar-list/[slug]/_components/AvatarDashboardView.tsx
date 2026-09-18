'use client'

import { useRouter } from 'next/navigation'
import Avatar from '@/components/ui/Avatar'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Tag from '@/components/ui/Tag'
import Tooltip from '@/components/ui/Tooltip'
import {
    TbArrowLeft,
    TbBrandTelegram,
    TbMessageChatbot,
    TbPhoto,
    TbSend,
} from 'react-icons/tb'
import type { AvatarEarningsDashboard } from '@/services/EarningsService'
import { ROUTES } from '@/components/view/earnings/constants'
import { formatStars } from '@/components/view/earnings/format'
import {
    PendingFrame,
    PendingProvider,
} from '@/components/view/earnings/PendingFrame'
import ConnectionStatusCard from '@/components/view/earnings/ConnectionStatusCard'
import EarningsHeader from '@/components/view/earnings/EarningsHeader'
import EarningsOverviewCard from '@/components/view/earnings/EarningsOverviewCard'
import RecentSalesList from '@/components/view/earnings/RecentSalesList'
import SyncNotices from '@/components/view/earnings/SyncNotices'
import AgentCard from './AgentCard'
import ReconnectFanvueCard from './ReconnectFanvueCard'
import TopItemsCard from './TopItemsCard'

interface AvatarDashboardViewProps {
    data: AvatarEarningsDashboard
}

/** El Button de ECME no acepta `href`: navega con el router, como TopProduct. */
const QuickLink = ({
    href,
    icon,
    children,
}: {
    href: string
    icon: React.ReactNode
    children: React.ReactNode
}) => {
    const router = useRouter()
    return (
        <Button
            size="xs"
            variant="plain"
            icon={icon}
            onClick={() => router.push(href)}
        >
            {children}
        </Button>
    )
}

const AvatarDashboardView = ({ data }: AvatarDashboardViewProps) => {
    const { avatar, fanvue, telegram } = data
    const fanvueLinked = Boolean(avatar.fanvueCreatorUuid)
    const telegramLinked = Boolean(avatar.telegramBotUsername)
    const fanvueEnabled = fanvue.connected && fanvueLinked
    const telegramEnabled = telegram.installed && telegramLinked

    return (
        <PendingProvider>
            <EarningsHeader
                fanvue={fanvue}
                leading={
                    <Avatar
                        size={56}
                        shape="circle"
                        src={avatar.thumbnailUrl ?? undefined}
                    >
                        {avatar.initials}
                    </Avatar>
                }
                title={avatar.name}
                subtitle={
                    <span className="flex flex-wrap items-center gap-1.5">
                        {fanvueLinked ? (
                            <Tag className="bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-100 border-0">
                                Fanvue{' '}
                                {avatar.fanvueCreatorHandle
                                    ? `@${avatar.fanvueCreatorHandle}`
                                    : ''}
                            </Tag>
                        ) : (
                            <Tag className="bg-gray-100 text-gray-600 dark:bg-gray-600 dark:text-gray-100 border-0">
                                Sin Fanvue
                            </Tag>
                        )}
                        {telegramLinked ? (
                            <Tag className="bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-100 border-0">
                                Telegram @{avatar.telegramBotUsername}
                                {avatar.telegramBotEnabled
                                    ? ''
                                    : ' (desconectado)'}
                            </Tag>
                        ) : (
                            <Tag className="bg-gray-100 text-gray-600 dark:bg-gray-600 dark:text-gray-100 border-0">
                                Sin Telegram
                            </Tag>
                        )}
                    </span>
                }
                below={
                    <div className="flex flex-wrap items-center gap-1">
                        <QuickLink href={ROUTES.home} icon={<TbArrowLeft />}>
                            Inicio
                        </QuickLink>
                        <QuickLink
                            href={ROUTES.studio(avatar.id)}
                            icon={<TbPhoto />}
                        >
                            Studio
                        </QuickLink>
                        <QuickLink
                            href={ROUTES.agent(avatar.id)}
                            icon={<TbMessageChatbot />}
                        >
                            Agente
                        </QuickLink>
                        {telegram.installed && (
                            <QuickLink
                                href={ROUTES.telegramAvatar(avatar.id)}
                                icon={<TbBrandTelegram />}
                            >
                                Telegram
                            </QuickLink>
                        )}
                        <QuickLink href={ROUTES.fanvuePosts} icon={<TbSend />}>
                            Posts Fanvue
                        </QuickLink>
                    </div>
                }
            />
            <PendingFrame className="flex flex-col gap-4">
                <SyncNotices fanvue={fanvue} meta={data.meta} />
                <div className="flex flex-col xl:flex-row gap-4">
                    <div className="flex flex-col gap-4 flex-1 min-w-0">
                        <EarningsOverviewCard
                            title="Ingresos del avatar"
                            preset={data.period.preset}
                            kpis={data.kpis}
                            series={data.series}
                            fanvueEnabled={fanvueEnabled}
                            telegramEnabled={telegramEnabled}
                        />
                        {fanvueLinked &&
                            (fanvue.connected && !fanvue.hasInsightsScope ? (
                                <ReconnectFanvueCard />
                            ) : fanvue.connected &&
                              data.fanvueBreakdown === null ? (
                                <Card>
                                    <h4 className="mb-2">
                                        Desglose Fanvue por tipo
                                    </h4>
                                    <p className="text-sm text-gray-500">
                                        El desglose por suscripciones, propinas
                                        y mensajes de pago llega con la
                                        siguiente fase de la integración de
                                        Fanvue.
                                    </p>
                                </Card>
                            ) : null)}
                    </div>
                    <div className="flex flex-col gap-4 xl:w-[340px] 2xl:w-[360px] shrink-0">
                        {telegramLinked && (
                            <Card>
                                <div className="flex items-center gap-1 mb-1">
                                    <p className="text-sm font-semibold">
                                        Saldo Stars del bot
                                    </p>
                                    <Tooltip title="Las Stars de cada venta se acreditan al bot de este avatar, no a esta plataforma. Telegram las retiene 21 días; después se retiran vía Fragment con la cuenta dueña del bot.">
                                        <span className="text-gray-400 text-xs cursor-help">
                                            ⓘ
                                        </span>
                                    </Tooltip>
                                </div>
                                <h3>
                                    {data.starBalance === null
                                        ? '—'
                                        : formatStars(data.starBalance)}
                                </h3>
                                <p className="text-xs text-gray-500 mt-1">
                                    Saldo actual, en vivo.
                                </p>
                            </Card>
                        )}
                        <AgentCard agent={data.agent} avatarId={avatar.id} />
                        <ConnectionStatusCard
                            fanvue={fanvue}
                            telegram={telegram}
                            avatar={{
                                fanvueCreatorHandle: avatar.fanvueCreatorHandle,
                                telegramBotUsername: avatar.telegramBotUsername,
                                telegramBotEnabled: avatar.telegramBotEnabled,
                            }}
                        />
                    </div>
                </div>
                {telegramLinked && (
                    <div className="grid grid-cols-1 xl:grid-cols-[1fr_2fr] gap-4">
                        <TopItemsCard items={data.topItems} />
                        <RecentSalesList
                            sales={data.recentTelegramSales}
                            showAvatar={false}
                            viewAllHref={ROUTES.telegramAvatar(avatar.id)}
                        />
                    </div>
                )}
            </PendingFrame>
        </PendingProvider>
    )
}

export default AvatarDashboardView
