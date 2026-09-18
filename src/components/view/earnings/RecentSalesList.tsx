'use client'

import Link from 'next/link'
import Card from '@/components/ui/Card'
import Table from '@/components/ui/Table'
import Tag from '@/components/ui/Tag'
import type { RecentTelegramSale } from '@/services/EarningsService'
import { ROUTES } from './constants'
import { formatDateTime, formatStars } from './format'

const { THead, TBody, Tr, Th, Td } = Table

interface RecentSalesListProps {
    sales: RecentTelegramSale[]
    showAvatar: boolean
    viewAllHref?: string
}

/**
 * Últimas ventas de Telegram (Fanvue no expone transacciones sin el scope
 * read:insights — fase C). No reutiliza `TelegramSalesPanel`: otra forma de
 * fila (sin estado ni comisión, con avatar y quién la cerró).
 */
const RecentSalesList = ({
    sales,
    showAvatar,
    viewAllHref,
}: RecentSalesListProps) => {
    return (
        <Card>
            <div className="flex items-center justify-between mb-4">
                <h4>Ventas recientes (Telegram)</h4>
                {viewAllHref && (
                    <Link
                        href={viewAllHref}
                        className="text-sm font-semibold text-primary hover:underline"
                    >
                        Ver todo
                    </Link>
                )}
            </div>
            {sales.length === 0 ? (
                <p className="text-sm text-gray-500">Todavía no hay ventas.</p>
            ) : (
                <div className="overflow-x-auto">
                    <Table compact>
                        <THead>
                            <Tr>
                                <Th>Fecha</Th>
                                {showAvatar && <Th>Avatar</Th>}
                                <Th>Contenido</Th>
                                <Th className="text-right">Stars</Th>
                                <Th>Cerrada por</Th>
                            </Tr>
                        </THead>
                        <TBody>
                            {sales.map((sale) => (
                                <Tr key={sale.id}>
                                    <Td>
                                        {/* La hora se pinta en la zona del navegador; en el
                                            servidor sale en UTC y React la corrige al hidratar. */}
                                        <span suppressHydrationWarning>
                                            {formatDateTime(sale.purchasedAt)}
                                        </span>
                                    </Td>
                                    {showAvatar && (
                                        <Td>
                                            <Link
                                                href={ROUTES.avatarDashboard(
                                                    sale.avatarId,
                                                )}
                                                className="font-semibold hover:text-primary"
                                            >
                                                {sale.avatarName}
                                            </Link>
                                        </Td>
                                    )}
                                    <Td>
                                        {sale.itemTitle ??
                                            'Contenido eliminado'}
                                    </Td>
                                    <Td className="text-right heading-text font-bold whitespace-nowrap">
                                        {formatStars(sale.stars)}
                                    </Td>
                                    <Td>
                                        <Tag
                                            className={
                                                sale.soldBy === 'ai'
                                                    ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200 border-0'
                                                    : 'bg-gray-100 text-gray-700 dark:bg-gray-600 dark:text-gray-100 border-0'
                                            }
                                        >
                                            {sale.soldBy === 'ai'
                                                ? 'IA'
                                                : 'Manual'}
                                        </Tag>
                                    </Td>
                                </Tr>
                            ))}
                        </TBody>
                    </Table>
                </div>
            )}
        </Card>
    )
}

export default RecentSalesList
