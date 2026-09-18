'use client'

import { useState } from 'react'
import Link from 'next/link'
import Card from '@/components/ui/Card'
import Tooltip from '@/components/ui/Tooltip'
import classNames from '@/utils/classNames'
import { TbCoin, TbReceipt2, TbStar, TbShoppingBagCheck } from 'react-icons/tb'
import type { ReactNode } from 'react'
import type {
    EarningsKpi,
    EarningsKpis,
    EarningsSeries,
} from '@/services/EarningsService'
import type { EarningsPreset } from '@/lib/earnings/period'
import { COMPARISON_LABEL, ROUTES, type ChartMetric } from './constants'
import { formatCount, formatStars, formatUsdCents } from './format'
import DeltaBadge from './DeltaBadge'
import EarningsChart from './EarningsChart'
import PeriodSelect from './PeriodSelect'

interface StatisticCardProps {
    title: string
    value: ReactNode
    icon: ReactNode
    iconClass: string
    kpi: EarningsKpi | null
    compareFrom: string
    active: boolean
    /** Sin fuente conectada: se muestra un enlace en vez de la cifra. */
    cta?: { label: string; href: string }
    hint?: string
    onClick: () => void
}

/** Misma tarjeta clicable que `dashboards/ecommerce/_components/Overview.tsx`. */
const StatisticCard = ({
    title,
    value,
    icon,
    iconClass,
    kpi,
    compareFrom,
    active,
    cta,
    hint,
    onClick,
}: StatisticCardProps) => {
    const disabled = Boolean(cta)
    return (
        <button
            type="button"
            disabled={disabled}
            className={classNames(
                'p-4 rounded-2xl ltr:text-left rtl:text-right transition duration-150 outline-hidden',
                disabled ? 'cursor-default opacity-80' : 'cursor-pointer',
                active && 'bg-white dark:bg-gray-900 shadow-md',
            )}
            onClick={onClick}
        >
            <div className="flex md:flex-col-reverse gap-2 2xl:flex-row justify-between relative">
                <div className="min-w-0">
                    <div className="mb-3 text-sm font-semibold flex items-center gap-1">
                        {title}
                        {hint && (
                            <Tooltip title={hint}>
                                <span className="text-gray-400 text-xs cursor-help">
                                    ⓘ
                                </span>
                            </Tooltip>
                        )}
                    </div>
                    {cta ? (
                        <div>
                            <h3 className="mb-1 text-gray-400">—</h3>
                            <Link
                                href={cta.href}
                                className="text-sm font-semibold text-primary hover:underline"
                            >
                                {cta.label}
                            </Link>
                        </div>
                    ) : (
                        <>
                            <h3 className="mb-1 truncate">{value}</h3>
                            <div className="inline-flex items-center flex-wrap gap-1 text-sm">
                                <DeltaBadge value={kpi?.changePct ?? null} />
                                <span className="text-gray-500">
                                    {compareFrom}
                                </span>
                            </div>
                        </>
                    )}
                </div>
                <div
                    className={classNames(
                        'flex items-center justify-center min-h-12 min-w-12 max-h-12 max-w-12 text-gray-900 rounded-full text-2xl',
                        iconClass,
                    )}
                >
                    {icon}
                </div>
            </div>
        </button>
    )
}

interface EarningsOverviewCardProps {
    title?: string
    preset: EarningsPreset
    kpis: EarningsKpis
    series: EarningsSeries
    fanvueEnabled: boolean
    telegramEnabled: boolean
    /** Métrica inicial de la gráfica. */
    defaultMetric?: ChartMetric
}

/**
 * La tarjeta "Overview" del dashboard de Ecommerce de ECME, con datos reales:
 * cabecera con selector de período, fila de KPIs clicables sobre fondo gris y
 * la gráfica de la métrica elegida. Cuatro KPIs, dos unidades: Fanvue en USD
 * (neto y bruto) y Telegram en Stars y ventas. Nunca se suman.
 */
const EarningsOverviewCard = ({
    title = 'Ingresos',
    preset,
    kpis,
    series,
    fanvueEnabled,
    telegramEnabled,
    defaultMetric,
}: EarningsOverviewCardProps) => {
    const initial: ChartMetric =
        defaultMetric ??
        (fanvueEnabled || !telegramEnabled ? 'fanvueNet' : 'stars')
    const [metric, setMetric] = useState<ChartMetric>(initial)
    const compareFrom = COMPARISON_LABEL[preset]

    return (
        <Card>
            <div className="flex items-center justify-between gap-2">
                <h4>{title}</h4>
                <PeriodSelect value={preset} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 rounded-2xl p-3 bg-gray-100 dark:bg-gray-700 mt-4">
                <StatisticCard
                    title="Fanvue neto"
                    value={formatUsdCents(kpis.fanvueNetCents.current)}
                    kpi={kpis.fanvueNetCents}
                    compareFrom={compareFrom}
                    icon={<TbCoin />}
                    iconClass="bg-sky-200 dark:opacity-70"
                    active={metric === 'fanvueNet'}
                    cta={
                        fanvueEnabled
                            ? undefined
                            : {
                                  label: 'Conectar Fanvue',
                                  href: ROUTES.fanvueAccounts,
                              }
                    }
                    hint="Lo que se lleva el creator tras la comisión de Fanvue, en dólares."
                    onClick={() => setMetric('fanvueNet')}
                />
                <StatisticCard
                    title="Fanvue bruto"
                    value={formatUsdCents(kpis.fanvueGrossCents.current)}
                    kpi={kpis.fanvueGrossCents}
                    compareFrom={compareFrom}
                    icon={<TbReceipt2 />}
                    iconClass="bg-indigo-200 dark:opacity-70"
                    active={metric === 'fanvueGross'}
                    cta={
                        fanvueEnabled
                            ? undefined
                            : {
                                  label: 'Conectar Fanvue',
                                  href: ROUTES.fanvueAccounts,
                              }
                    }
                    hint="Lo que pagaron los fans en Fanvue, antes de comisiones."
                    onClick={() => setMetric('fanvueGross')}
                />
                <StatisticCard
                    title="Telegram Stars"
                    value={formatStars(kpis.stars.current)}
                    kpi={kpis.stars}
                    compareFrom={compareFrom}
                    icon={<TbStar />}
                    iconClass="bg-orange-200 dark:opacity-70"
                    active={metric === 'stars'}
                    cta={
                        telegramEnabled
                            ? undefined
                            : {
                                  label: 'Instalar Telegram',
                                  href: ROUTES.telegram,
                              }
                    }
                    hint="Stars cobradas por los bots de tus avatares. No se convierten a dólares: el cambio depende de la tienda del fan."
                    onClick={() => setMetric('stars')}
                />
                <StatisticCard
                    title="Ventas Telegram"
                    value={formatCount(kpis.telegramSales.current)}
                    kpi={kpis.telegramSales}
                    compareFrom={compareFrom}
                    icon={<TbShoppingBagCheck />}
                    iconClass="bg-emerald-200 dark:opacity-70"
                    active={metric === 'telegramSales'}
                    cta={
                        telegramEnabled
                            ? undefined
                            : {
                                  label: 'Instalar Telegram',
                                  href: ROUTES.telegram,
                              }
                    }
                    onClick={() => setMetric('telegramSales')}
                />
            </div>
            <div className="mt-4">
                <EarningsChart
                    series={series}
                    metric={metric}
                    comparisonLabel={compareFrom}
                />
            </div>
        </Card>
    )
}

export default EarningsOverviewCard
