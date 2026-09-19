'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    flexRender,
    getCoreRowModel,
    getSortedRowModel,
    useReactTable,
    type ColumnDef,
    type SortingState,
} from '@tanstack/react-table'
import Avatar from '@/components/ui/Avatar'
import Card from '@/components/ui/Card'
import Segment from '@/components/ui/Segment'
import Table from '@/components/ui/Table'
import Tag from '@/components/ui/Tag'
import useTheme from '@/utils/hooks/useTheme'
import { MODE_DARK } from '@/constants/theme.constant'
import classNames from '@/utils/classNames'
import type { AvatarEarningsRow } from '@/services/EarningsService'
import type { EarningsPreset } from '@/lib/earnings/period'
import { EARNINGS_COLORS, ROUTES } from './constants'
import { formatCount, formatStars, formatUsdCents } from './format'
import DeltaBadge from './DeltaBadge'
import Sparkline from './Sparkline'

const { Tr, Th, Td, THead, TBody, Sorter } = Table

interface AvatarRankingTableProps {
    rows: AvatarEarningsRow[]
    preset: EarningsPreset
    fanvueEnabled: boolean
    telegramEnabled: boolean
}

type SparkMetric = 'fanvue' | 'stars'

/**
 * "Por avatar": la tabla de "Recent order" de la plantilla con ordenación
 * (`@tanstack/react-table` + `Table.Sorter`). Clic en la fila → dashboard del
 * avatar con el mismo período. Las columnas de delta y tendencia se ocultan
 * en móvil.
 */
const AvatarRankingTable = ({
    rows,
    preset,
    fanvueEnabled,
    telegramEnabled,
}: AvatarRankingTableProps) => {
    const router = useRouter()
    const mode = useTheme((state) => state.mode)
    const dark = mode === MODE_DARK
    const [spark, setSpark] = useState<SparkMetric>(
        fanvueEnabled || !telegramEnabled ? 'fanvue' : 'stars',
    )
    const [sorting, setSorting] = useState<SortingState>([
        {
            id: fanvueEnabled || !telegramEnabled ? 'fanvueNetCents' : 'stars',
            desc: true,
        },
    ])

    const sparkColor =
        spark === 'fanvue'
            ? dark
                ? EARNINGS_COLORS.fanvue.dark
                : EARNINGS_COLORS.fanvue.light
            : dark
              ? EARNINGS_COLORS.stars.dark
              : EARNINGS_COLORS.stars.light

    const columns = useMemo<ColumnDef<AvatarEarningsRow>[]>(
        () => [
            {
                id: 'name',
                accessorKey: 'name',
                header: 'Avatar',
                cell: ({ row }) => {
                    const r = row.original
                    return (
                        <div className="flex items-center gap-3 min-w-0">
                            <Avatar
                                size={36}
                                shape="circle"
                                src={r.thumbnailUrl ?? undefined}
                                // Mismo modo CORS que AvatarCard: esta URL es la
                                // MISMA que pinta la lista con crossOrigin, y un
                                // <img> sin modo envenenaba la caché (2026-09-19).
                                crossOrigin="anonymous"
                            >
                                {r.initials}
                            </Avatar>
                            <div className="min-w-0">
                                <div className="heading-text font-bold truncate">
                                    {r.name}
                                </div>
                                <div className="flex gap-1 mt-0.5">
                                    {r.fanvueLinked && (
                                        <Tag className="text-[10px] px-1.5 py-0 bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-100 border-0">
                                            Fanvue
                                        </Tag>
                                    )}
                                    {r.telegramLinked && (
                                        <Tag className="text-[10px] px-1.5 py-0 bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-100 border-0">
                                            Telegram
                                        </Tag>
                                    )}
                                </div>
                            </div>
                        </div>
                    )
                },
            },
            {
                id: 'fanvueNetCents',
                accessorKey: 'fanvueNetCents',
                header: 'Fanvue neto',
                meta: { align: 'right' },
                cell: ({ row }) => (
                    <span className="heading-text font-bold tabular-nums">
                        {formatUsdCents(row.original.fanvueNetCents)}
                    </span>
                ),
            },
            {
                id: 'fanvueNetDeltaPct',
                accessorKey: 'fanvueNetDeltaPct',
                header: 'Δ',
                meta: { hideOnMobile: true },
                sortUndefined: 'last',
                cell: ({ row }) => (
                    <DeltaBadge value={row.original.fanvueNetDeltaPct} />
                ),
            },
            {
                id: 'stars',
                accessorKey: 'stars',
                header: 'Stars',
                meta: { align: 'right' },
                cell: ({ row }) => (
                    <span className="heading-text font-bold tabular-nums whitespace-nowrap">
                        {formatStars(row.original.stars)}
                    </span>
                ),
            },
            {
                id: 'starsDeltaPct',
                accessorKey: 'starsDeltaPct',
                header: 'Δ',
                meta: { hideOnMobile: true },
                sortUndefined: 'last',
                cell: ({ row }) => (
                    <DeltaBadge value={row.original.starsDeltaPct} />
                ),
            },
            {
                id: 'telegramSales',
                accessorKey: 'telegramSales',
                header: 'Ventas',
                meta: { align: 'right' },
                cell: ({ row }) => (
                    <span className="tabular-nums">
                        {formatCount(row.original.telegramSales)}
                    </span>
                ),
            },
            {
                id: 'spark',
                header: 'Tendencia',
                enableSorting: false,
                meta: { hideOnMobile: true },
                cell: ({ row }) => (
                    <Sparkline
                        values={
                            spark === 'fanvue'
                                ? row.original.sparkFanvueNetCents
                                : row.original.sparkStars
                        }
                        color={sparkColor}
                        label={`Tendencia de ${row.original.name}`}
                    />
                ),
            },
        ],
        [spark, sparkColor],
    )

    const table = useReactTable({
        data: rows,
        columns,
        state: { sorting },
        onSortingChange: setSorting,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
    })

    const cellClass = (meta: unknown) => {
        const m = (meta ?? {}) as { align?: 'right'; hideOnMobile?: boolean }
        return classNames(
            m.align === 'right' && 'text-right',
            m.hideOnMobile && 'hidden md:table-cell',
        )
    }

    return (
        <Card>
            <div className="flex items-center justify-between gap-2 mb-4">
                <h4>Por avatar</h4>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 hidden md:inline">
                        Tendencia:
                    </span>
                    <Segment
                        size="xs"
                        value={spark}
                        onChange={(v) => setSpark(v as SparkMetric)}
                    >
                        <Segment.Item value="fanvue" disabled={!fanvueEnabled}>
                            Fanvue
                        </Segment.Item>
                        <Segment.Item value="stars" disabled={!telegramEnabled}>
                            Stars
                        </Segment.Item>
                    </Segment>
                </div>
            </div>
            {rows.length === 0 ? (
                <p className="text-sm text-gray-500">
                    Todavía no hay avatares en esta organización.
                </p>
            ) : (
                <div className="overflow-x-auto">
                    <Table hoverable>
                        <THead>
                            {table.getHeaderGroups().map((headerGroup) => (
                                <Tr key={headerGroup.id}>
                                    {headerGroup.headers.map((header) => (
                                        <Th
                                            key={header.id}
                                            colSpan={header.colSpan}
                                            className={cellClass(
                                                header.column.columnDef.meta,
                                            )}
                                        >
                                            {header.isPlaceholder ? null : (
                                                <div
                                                    className={classNames(
                                                        'flex items-center gap-1',
                                                        (
                                                            header.column
                                                                .columnDef
                                                                .meta as
                                                                | {
                                                                      align?: string
                                                                  }
                                                                | undefined
                                                        )?.align === 'right' &&
                                                            'justify-end',
                                                        header.column.getCanSort() &&
                                                            'cursor-pointer select-none',
                                                    )}
                                                    onClick={header.column.getToggleSortingHandler()}
                                                >
                                                    {flexRender(
                                                        header.column.columnDef
                                                            .header,
                                                        header.getContext(),
                                                    )}
                                                    {header.column.getCanSort() && (
                                                        <Sorter
                                                            sort={header.column.getIsSorted()}
                                                        />
                                                    )}
                                                </div>
                                            )}
                                        </Th>
                                    ))}
                                </Tr>
                            ))}
                        </THead>
                        <TBody>
                            {table.getRowModel().rows.map((row) => (
                                <Tr
                                    key={row.id}
                                    className="cursor-pointer"
                                    onClick={() =>
                                        router.push(
                                            ROUTES.avatarDashboard(
                                                row.original.avatarId,
                                                preset,
                                            ),
                                        )
                                    }
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <Td
                                            key={cell.id}
                                            className={cellClass(
                                                cell.column.columnDef.meta,
                                            )}
                                        >
                                            {flexRender(
                                                cell.column.columnDef.cell,
                                                cell.getContext(),
                                            )}
                                        </Td>
                                    ))}
                                </Tr>
                            ))}
                        </TBody>
                    </Table>
                </div>
            )}
        </Card>
    )
}

export default AvatarRankingTable
