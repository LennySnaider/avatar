import Card from '@/components/ui/Card'
import type { AvatarEarningsDashboard } from '@/services/EarningsService'
import { formatCount, formatStars } from '@/components/view/earnings/format'
import RankedBarList from '@/components/view/earnings/RankedBarList'

interface TopItemsCardProps {
    items: AvatarEarningsDashboard['topItems']
}

/** Contenidos más vendidos del avatar. Contadores históricos del ítem (best-effort), no del período. */
const TopItemsCard = ({ items }: TopItemsCardProps) => {
    return (
        <Card>
            <h4 className="mb-1">Top contenidos</h4>
            <p className="text-xs text-gray-500 mb-4">
                Histórico, por Stars acumuladas.
            </p>
            <RankedBarList
                tone="stars"
                emptyText="Todavía no se ha vendido ningún contenido."
                rows={items.map((i) => ({
                    key: i.id,
                    label: i.title,
                    sub: `${formatCount(i.sales)} venta${i.sales === 1 ? '' : 's'}`,
                    value: i.stars,
                    display: formatStars(i.stars),
                }))}
            />
        </Card>
    )
}

export default TopItemsCard
