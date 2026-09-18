'use client'

import { useState } from 'react'
import Avatar from '@/components/ui/Avatar'
import Card from '@/components/ui/Card'
import Segment from '@/components/ui/Segment'
import type { AvatarEarningsRow } from '@/services/EarningsService'
import type { EarningsPreset } from '@/lib/earnings/period'
import { ROUTES } from './constants'
import { formatCount, formatStars, formatUsdCents } from './format'
import RankedBarList from './RankedBarList'

interface TopAvatarsCardProps {
    rows: AvatarEarningsRow[]
    preset: EarningsPreset
    fanvueEnabled: boolean
    telegramEnabled: boolean
}

type Metric = 'fanvue' | 'stars'

/** "Top product" de la plantilla, con avatares: 5 primeros por Fanvue neto o por Stars. */
const TopAvatarsCard = ({
    rows,
    preset,
    fanvueEnabled,
    telegramEnabled,
}: TopAvatarsCardProps) => {
    const [metric, setMetric] = useState<Metric>(
        fanvueEnabled || !telegramEnabled ? 'fanvue' : 'stars',
    )
    const top = [...rows]
        .sort((a, b) =>
            metric === 'fanvue'
                ? b.fanvueNetCents - a.fanvueNetCents
                : b.stars - a.stars,
        )
        .filter((r) =>
            metric === 'fanvue' ? r.fanvueNetCents > 0 : r.stars > 0,
        )
        .slice(0, 5)

    return (
        <Card>
            <div className="flex items-center justify-between gap-2 mb-4">
                <h4>Top avatares</h4>
                <Segment
                    size="xs"
                    value={metric}
                    onChange={(v) => setMetric(v as Metric)}
                >
                    <Segment.Item value="fanvue" disabled={!fanvueEnabled}>
                        Fanvue
                    </Segment.Item>
                    <Segment.Item value="stars" disabled={!telegramEnabled}>
                        Stars
                    </Segment.Item>
                </Segment>
            </div>
            <RankedBarList
                tone={metric}
                emptyText="Ningún avatar tuvo ingresos en este período."
                rows={top.map((r) => ({
                    key: r.avatarId,
                    label: (
                        <span className="flex items-center gap-2">
                            <Avatar
                                size={28}
                                shape="circle"
                                src={r.thumbnailUrl ?? undefined}
                            >
                                {r.initials}
                            </Avatar>
                            <span className="truncate">{r.name}</span>
                        </span>
                    ),
                    sub:
                        metric === 'stars'
                            ? `${formatCount(r.telegramSales)} venta${r.telegramSales === 1 ? '' : 's'}`
                            : undefined,
                    value: metric === 'fanvue' ? r.fanvueNetCents : r.stars,
                    display:
                        metric === 'fanvue'
                            ? formatUsdCents(r.fanvueNetCents)
                            : formatStars(r.stars),
                    href: ROUTES.avatarDashboard(r.avatarId, preset),
                }))}
            />
        </Card>
    )
}

export default TopAvatarsCard
