import Link from 'next/link'
import Card from '@/components/ui/Card'
import type { AvatarEarningsDashboard } from '@/services/EarningsService'
import { ROUTES } from '@/components/view/earnings/constants'
import { formatCount, formatDeltaPct } from '@/components/view/earnings/format'

interface AgentCardProps {
    agent: AvatarEarningsDashboard['agent']
    avatarId: string
}

/**
 * KPIs del agente (SUPER-PLAN F6): mensajes del mes en curso desde
 * `agent_usage_counters` (que es mensual) y, del período elegido, qué parte de
 * las ventas de Telegram cerró la IA sola — el argumento comercial del producto.
 */
const AgentCard = ({ agent, avatarId }: AgentCardProps) => {
    return (
        <Card>
            <h4 className="mb-3">Agente</h4>
            {!agent ? (
                <p className="text-sm text-gray-500">
                    Sin actividad del agente todavía.{' '}
                    <Link
                        href={ROUTES.agent(avatarId)}
                        className="font-semibold text-primary hover:underline"
                    >
                        Configurar
                    </Link>
                </p>
            ) : (
                <div className="grid grid-cols-3 gap-3">
                    <div>
                        <p className="text-xs text-gray-500">Mensajes (mes)</p>
                        <p className="text-xl font-bold heading-text">
                            {formatCount(agent.messagesSent)}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-500">Auto-enviados</p>
                        <p className="text-xl font-bold heading-text">
                            {formatCount(agent.autoSent)}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-500">Ventas por IA</p>
                        <p className="text-xl font-bold heading-text">
                            {agent.aiSalesPct === null
                                ? '—'
                                : formatDeltaPct(agent.aiSalesPct).replace(
                                      '+',
                                      '',
                                  )}
                        </p>
                        <p className="text-[11px] text-gray-500">
                            {formatCount(agent.aiSales)} IA ·{' '}
                            {formatCount(agent.manualSales)} manual
                        </p>
                    </div>
                </div>
            )}
        </Card>
    )
}

export default AgentCard
