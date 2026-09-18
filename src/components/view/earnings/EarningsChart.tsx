'use client'

import { useMemo } from 'react'
import dynamic from 'next/dynamic'
import Loading from '@/components/shared/Loading'
import useTheme from '@/utils/hooks/useTheme'
import { MODE_DARK } from '@/constants/theme.constant'
import type { ApexOptions } from 'apexcharts'
import type { EarningsSeries } from '@/services/EarningsService'
import type { EarningsPoint } from '@/lib/earnings/period'
import { EARNINGS_COLORS, METRIC_LABEL, type ChartMetric } from './constants'
import {
    formatBucketLabel,
    formatBucketRange,
    formatCompact,
    formatStars,
    formatUsdCents,
    formatUsdCompact,
} from './format'
import useChartResizeOnSidenav from './useChartResizeOnSidenav'

const HEIGHT = 360

const Chart = dynamic(() => import('@/components/shared/Chart'), {
    ssr: false,
    loading: () => (
        <div className="h-[360px] flex items-center justify-center">
            <Loading loading />
        </div>
    ),
})

interface EarningsChartProps {
    series: EarningsSeries
    metric: ChartMetric
    comparisonLabel: string
}

function valueOf(point: EarningsPoint, metric: ChartMetric): number {
    switch (metric) {
        case 'fanvueNet':
            return point.fanvueNetCents / 100
        case 'fanvueGross':
            return point.fanvueGrossCents / 100
        case 'stars':
            return point.stars
        case 'telegramSales':
            return point.telegramSales
    }
}

/**
 * Gráfica principal: UNA métrica (una unidad) por vez, con el período
 * anterior en gris punteado alineado por índice. Fanvue se pinta como área,
 * Telegram como columnas.
 *
 * `customOptions` de `Chart` se fusiona SUPERFICIALMENTE con los defaults
 * (`{...defaults, ...customOptions}`): cada clave que se pasa aquí sustituye
 * el objeto entero, por eso van completos (`chart` con toolbar/zoom apagados,
 * `xaxis` con sus `categories`). El modo oscuro de Apex lo resuelve
 * `_apex-chart.css`; aquí sólo se deciden los colores de las series.
 */
const EarningsChart = ({
    series,
    metric,
    comparisonLabel,
}: EarningsChartProps) => {
    useChartResizeOnSidenav()
    const mode = useTheme((state) => state.mode)
    const dark = mode === MODE_DARK
    const isUsd = metric === 'fanvueNet' || metric === 'fanvueGross'
    const isFanvue = isUsd
    const isStars = metric === 'stars'

    const { apexSeries, categories, options } = useMemo(() => {
        const current = series.current.map((p) => valueOf(p, metric))
        const previous = series.previous.map((p) => valueOf(p, metric))
        const categories = series.current.map((p) =>
            formatBucketLabel(p.day, series.bucket),
        )
        const tone = isFanvue ? EARNINGS_COLORS.fanvue : EARNINGS_COLORS.stars
        const colors = [
            dark ? tone.dark : tone.light,
            dark
                ? EARNINGS_COLORS.previous.dark
                : EARNINGS_COLORS.previous.light,
        ]
        const formatValue = (v: number) =>
            isUsd
                ? formatUsdCents(Math.round(v * 100))
                : isStars
                  ? formatStars(v)
                  : formatCompact(v)
        const formatTick = (v: number) =>
            isUsd ? formatUsdCompact(Math.round(v * 100)) : formatCompact(v)

        const apexSeries: ApexAxisChartSeries = [
            {
                name: METRIC_LABEL[metric],
                type: isFanvue ? 'area' : 'column',
                data: current,
            },
            { name: 'Período anterior', type: 'line', data: previous },
        ]
        const options: ApexOptions = {
            chart: {
                toolbar: { show: false },
                zoom: { enabled: false },
                animations: { speed: 300 },
                parentHeightOffset: 0,
                fontFamily: 'inherit',
            },
            colors,
            stroke: {
                width: isFanvue ? [2, 2] : [0, 2],
                curve: 'straight',
                dashArray: [0, 5],
                lineCap: 'round',
            },
            fill: { type: 'solid', opacity: isFanvue ? [0.12, 1] : [1, 1] },
            markers: { size: 0, hover: { size: 5 }, strokeWidth: 2 },
            plotOptions: {
                bar: {
                    columnWidth: '45%',
                    borderRadius: 3,
                    borderRadiusApplication: 'end',
                },
            },
            dataLabels: { enabled: false },
            grid: {
                strokeDashArray: 0,
                padding: { left: 8, right: 8 },
                xaxis: { lines: { show: false } },
            },
            xaxis: {
                categories,
                axisBorder: { show: false },
                axisTicks: { show: false },
                tickAmount:
                    series.bucket === 'day'
                        ? Math.min(6, categories.length)
                        : undefined,
                tooltip: { enabled: false },
                labels: { rotate: 0, hideOverlappingLabels: true },
            },
            yaxis: {
                min: 0,
                tickAmount: 4,
                forceNiceScale: true,
                labels: { formatter: (v: number) => formatTick(v) },
            },
            legend: {
                show: true,
                position: 'top',
                horizontalAlign: 'right',
                markers: { size: 5, shape: 'circle' },
                itemMargin: { horizontal: 8, vertical: 4 },
            },
            tooltip: {
                shared: true,
                intersect: false,
                x: {
                    formatter: (
                        _value: number,
                        opts?: { dataPointIndex?: number },
                    ) => {
                        const i = opts?.dataPointIndex ?? 0
                        const cur = series.current[i]
                        const prev = series.previous[i]
                        const curLabel = cur
                            ? formatBucketRange(cur.day, series.bucket)
                            : ''
                        const prevLabel = prev?.day
                            ? formatBucketRange(prev.day, series.bucket)
                            : ''
                        return prevLabel
                            ? `${curLabel} · anterior: ${prevLabel}`
                            : curLabel
                    },
                },
                y: { formatter: (v: number) => formatValue(v) },
            },
            noData: { text: 'Sin ingresos en este período' },
        }
        return { apexSeries, categories, options }
    }, [series, metric, dark, isFanvue, isUsd, isStars])

    const hasData = apexSeries.some((s) =>
        (s.data as number[]).some((v) => v > 0),
    )

    return (
        <div className="min-h-[360px]">
            <Chart
                type="line"
                height={HEIGHT}
                series={hasData ? apexSeries : []}
                xAxis={categories}
                customOptions={options}
            />
            <p className="text-xs text-gray-500 mt-1">
                Línea punteada: {comparisonLabel.toLowerCase()}. Días en UTC.
            </p>
        </div>
    )
}

export default EarningsChart
