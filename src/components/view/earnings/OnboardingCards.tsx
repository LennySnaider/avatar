'use client'

import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import { TbBrandTelegram, TbCoin } from 'react-icons/tb'
import type {
    FanvueSyncStatus,
    TelegramStatus,
} from '@/services/EarningsService'
import { ROUTES } from './constants'

interface OnboardingCardsProps {
    fanvue: FanvueSyncStatus
    telegram: TelegramStatus
}

/**
 * Lo que ve una organización sin ninguna fuente de ingresos conectada: en
 * vez de KPIs a cero, las dos puertas de entrada y qué esperar de cada una.
 */
const OnboardingCards = ({ fanvue, telegram }: OnboardingCardsProps) => {
    const router = useRouter()
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
                <div className="flex items-start gap-4">
                    <div className="flex items-center justify-center h-12 w-12 rounded-full bg-sky-200 dark:opacity-70 text-2xl text-gray-900 shrink-0">
                        <TbCoin />
                    </div>
                    <div className="flex-1">
                        <h5 className="mb-1">Conecta Fanvue</h5>
                        <p className="text-sm text-gray-500 mb-4">
                            Conecta tu agencia de Fanvue y asigna un creator a
                            cada avatar. Los ingresos diarios en dólares (bruto
                            y neto) aparecerán aquí tras la primera
                            sincronización, que corre cada hora.
                        </p>
                        <Button
                            size="sm"
                            variant="solid"
                            disabled={fanvue.connected}
                            onClick={() => router.push(ROUTES.fanvueAccounts)}
                        >
                            {fanvue.connected
                                ? 'Fanvue conectado'
                                : 'Conectar Fanvue'}
                        </Button>
                    </div>
                </div>
            </Card>
            <Card>
                <div className="flex items-start gap-4">
                    <div className="flex items-center justify-center h-12 w-12 rounded-full bg-orange-200 dark:opacity-70 text-2xl text-gray-900 shrink-0">
                        <TbBrandTelegram />
                    </div>
                    <div className="flex-1">
                        <h5 className="mb-1">Vende con Telegram Stars</h5>
                        <p className="text-sm text-gray-500 mb-4">
                            Instala el módulo de Telegram y conecta un bot por
                            avatar. Cada venta de contenido de pago se registra
                            al instante y se muestra aquí en Stars.
                        </p>
                        <Button
                            size="sm"
                            variant="solid"
                            onClick={() =>
                                router.push(
                                    telegram.installed
                                        ? ROUTES.telegram
                                        : ROUTES.modules,
                                )
                            }
                        >
                            {telegram.installed
                                ? 'Conectar un bot'
                                : 'Instalar Telegram'}
                        </Button>
                    </div>
                </div>
            </Card>
        </div>
    )
}

export default OnboardingCards
