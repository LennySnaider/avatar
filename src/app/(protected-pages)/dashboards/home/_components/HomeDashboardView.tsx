'use client'

import type { OrgEarningsDashboard } from '@/services/EarningsService'
import { ROUTES } from '@/components/view/earnings/constants'
import {
    PendingFrame,
    PendingProvider,
} from '@/components/view/earnings/PendingFrame'
import AvatarRankingTable from '@/components/view/earnings/AvatarRankingTable'
import ConnectionStatusCard from '@/components/view/earnings/ConnectionStatusCard'
import EarningsHeader from '@/components/view/earnings/EarningsHeader'
import EarningsOverviewCard from '@/components/view/earnings/EarningsOverviewCard'
import OnboardingCards from '@/components/view/earnings/OnboardingCards'
import RecentSalesList from '@/components/view/earnings/RecentSalesList'
import SyncNotices from '@/components/view/earnings/SyncNotices'
import TopAvatarsCard from '@/components/view/earnings/TopAvatarsCard'

interface HomeDashboardViewProps {
    data: OrgEarningsDashboard
}

/**
 * Misma disposición que el dashboard de Ecommerce de ECME: Overview (KPIs +
 * gráfica) y tabla a la izquierda, tarjetas de apoyo a la derecha, lista de
 * actividad reciente abajo.
 */
const HomeDashboardView = ({ data }: HomeDashboardViewProps) => {
    const fanvueEnabled = data.fanvue.connected
    const telegramEnabled = data.telegram.installed
    const nothingConnected =
        !data.fanvue.connected &&
        data.telegram.bots === 0 &&
        data.kpis.stars.current === 0 &&
        data.kpis.stars.previous === 0

    return (
        <PendingProvider>
            <EarningsHeader
                title="Inicio"
                subtitle="Ingresos de todos tus avatares en Fanvue y Telegram"
                fanvue={data.fanvue}
            />
            <PendingFrame className="flex flex-col gap-4">
                <SyncNotices fanvue={data.fanvue} meta={data.meta} />
                {nothingConnected ? (
                    <>
                        <OnboardingCards
                            fanvue={data.fanvue}
                            telegram={data.telegram}
                        />
                        <ConnectionStatusCard
                            fanvue={data.fanvue}
                            telegram={data.telegram}
                        />
                    </>
                ) : (
                    <>
                        <div className="flex flex-col xl:flex-row gap-4">
                            <div className="flex flex-col gap-4 flex-1 min-w-0">
                                <EarningsOverviewCard
                                    preset={data.period.preset}
                                    kpis={data.kpis}
                                    series={data.series}
                                    fanvueEnabled={fanvueEnabled}
                                    telegramEnabled={telegramEnabled}
                                />
                                <AvatarRankingTable
                                    rows={data.byAvatar}
                                    preset={data.period.preset}
                                    fanvueEnabled={fanvueEnabled}
                                    telegramEnabled={telegramEnabled}
                                />
                            </div>
                            <div className="flex flex-col gap-4 xl:w-[340px] 2xl:w-[360px] shrink-0">
                                <TopAvatarsCard
                                    rows={data.byAvatar}
                                    preset={data.period.preset}
                                    fanvueEnabled={fanvueEnabled}
                                    telegramEnabled={telegramEnabled}
                                />
                                <ConnectionStatusCard
                                    fanvue={data.fanvue}
                                    telegram={data.telegram}
                                    activity={{
                                        activeAvatars: data.kpis.activeAvatars,
                                        totalAvatars: data.kpis.totalAvatars,
                                    }}
                                />
                            </div>
                        </div>
                        {telegramEnabled && (
                            <RecentSalesList
                                sales={data.recentTelegramSales}
                                showAvatar
                                viewAllHref={ROUTES.telegram}
                            />
                        )}
                    </>
                )}
            </PendingFrame>
        </PendingProvider>
    )
}

export default HomeDashboardView
