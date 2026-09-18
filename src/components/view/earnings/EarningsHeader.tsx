import type { ReactNode } from 'react'
import type { FanvueSyncStatus } from '@/services/EarningsService'
import RefreshButton from './RefreshButton'

interface EarningsHeaderProps {
    title: ReactNode
    subtitle?: ReactNode
    /** Identidad del avatar u otro contenido a la izquierda del título. */
    leading?: ReactNode
    /** Bajo el título (chips, enlaces rápidos…). */
    below?: ReactNode
    fanvue: FanvueSyncStatus
}

/** Cabecera de ambos dashboards: título a la izquierda, "Actualizar" a la derecha. */
const EarningsHeader = ({
    title,
    subtitle,
    leading,
    below,
    fanvue,
}: EarningsHeaderProps) => {
    return (
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
            <div className="flex items-start gap-4 min-w-0">
                {leading}
                <div className="min-w-0">
                    <h3 className="mb-1">{title}</h3>
                    {subtitle && (
                        <p className="text-sm text-gray-500">{subtitle}</p>
                    )}
                    {below && <div className="mt-3">{below}</div>}
                </div>
            </div>
            <RefreshButton
                fanvueConnected={fanvue.connected}
                lastSyncedAt={fanvue.lastSyncedAt}
                emphasis={fanvue.connected && fanvue.lastSyncedAt === null}
            />
        </div>
    )
}

export default EarningsHeader
