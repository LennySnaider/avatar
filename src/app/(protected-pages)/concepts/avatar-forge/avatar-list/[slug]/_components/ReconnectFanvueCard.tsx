'use client'

import { useRouter } from 'next/navigation'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { ROUTES } from '@/components/view/earnings/constants'

/**
 * El desglose por tipo (suscripciones, propinas, mensajes de pago) y las
 * mejores horas salen del endpoint de insights de Fanvue, que exige el scope
 * `read:insights`. La conexión actual no lo tiene: hay que reconectar Fanvue
 * una vez para concederlo (fase C del plan de dashboards).
 */
const ReconnectFanvueCard = () => {
    const router = useRouter()
    return (
        <Card>
            <h4 className="mb-2">Desglose Fanvue por tipo</h4>
            <p className="text-sm text-gray-500 mb-4">
                Reconecta Fanvue para ver el desglose por tipo (suscripciones,
                propinas, mensajes de pago) y las mejores horas de venta. La
                conexión actual no tiene el permiso de insights.
            </p>
            <Button
                size="sm"
                variant="solid"
                onClick={() => router.push(ROUTES.fanvueAccounts)}
            >
                Reconectar Fanvue
            </Button>
        </Card>
    )
}

export default ReconnectFanvueCard
