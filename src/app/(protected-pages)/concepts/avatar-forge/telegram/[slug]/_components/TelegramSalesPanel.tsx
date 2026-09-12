'use client'

import Card from '@/components/ui/Card'
import Table from '@/components/ui/Table'
import Tag from '@/components/ui/Tag'
import type { TelegramSaleRow } from './types'

const { THead, TBody, Tr, Th, Td } = Table

interface TelegramSalesPanelProps {
    sales: TelegramSaleRow[]
    /** `null` = no bot ever connected for this avatar, nothing to show. */
    starBalance: number | null
}

const STATUS_STYLES: Record<string, string> = {
    offered: 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-100 border-0',
    purchased: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-100 border-0',
}

const STATUS_LABELS: Record<string, string> = {
    offered: 'Offered — awaiting payment',
    purchased: 'Purchased',
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleString()
}

/** No convertir nunca Stars a dólares aquí: el tipo de cambio depende de
 *  dónde compró el fan (las tiendas de móvil se llevan su parte encima) —
 *  mostrar un dólar inventado sería más falso que no mostrar ninguno. */
const TelegramSalesPanel = ({ sales, starBalance }: TelegramSalesPanelProps) => {
    return (
        <div className="flex flex-col gap-4">
            <Card>
                <p className="text-sm font-semibold mb-1">Bot Star balance</p>
                <p className="text-2xl font-bold mb-3">
                    {starBalance === null ? '—' : `⭐ ${starBalance.toLocaleString()}`}
                </p>
                <p className="text-xs text-gray-500">
                    Stars from every sale are credited straight to this avatar&apos;s own Telegram
                    bot — not to this platform. To turn them into money, withdraw via{' '}
                    <span className="font-semibold">Fragment</span> using the same account that
                    owns the bot. Telegram holds newly received Stars for{' '}
                    <span className="font-semibold">21 days</span> before they can be withdrawn.
                    This platform never custodies or moves these funds; it only records what was
                    sold and, when applicable, the commission owed on it.
                </p>
            </Card>

            <Card>
                <p className="text-sm font-semibold mb-3">Recent sales</p>
                {sales.length === 0 ? (
                    <p className="text-sm text-gray-500">No sales yet.</p>
                ) : (
                    <Table>
                        <THead>
                            <Tr>
                                <Th>Date</Th>
                                <Th>Content</Th>
                                <Th>Stars</Th>
                                <Th>Status</Th>
                                <Th>Commission</Th>
                            </Tr>
                        </THead>
                        <TBody>
                            {sales.map((sale) => (
                                <Tr key={sale.id}>
                                    <Td>{formatDate(sale.purchasedAt ?? sale.offeredAt)}</Td>
                                    <Td>{sale.itemTitle ?? 'Content deleted'}</Td>
                                    <Td>⭐ {sale.stars}</Td>
                                    <Td>
                                        <Tag className={STATUS_STYLES[sale.status] ?? ''}>
                                            {STATUS_LABELS[sale.status] ?? sale.status}
                                        </Tag>
                                    </Td>
                                    <Td>
                                        {sale.commissionSettled
                                            ? `${sale.commissionTokens ?? 0} tokens (${sale.commissionPct ?? 0}%)`
                                            : 'Pending'}
                                    </Td>
                                </Tr>
                            ))}
                        </TBody>
                    </Table>
                )}
            </Card>
        </div>
    )
}

export default TelegramSalesPanel
