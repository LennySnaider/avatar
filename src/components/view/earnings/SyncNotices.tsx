import Link from 'next/link'
import Alert from '@/components/ui/Alert'
import type { EarningsMeta, FanvueSyncStatus } from '@/services/EarningsService'
import { ROUTES } from './constants'

interface SyncNoticesProps {
    fanvue: FanvueSyncStatus
    meta: EarningsMeta
}

/**
 * Avisos sobre la calidad del dato, apilados. Ninguno tumba la página: son
 * matices que el usuario tiene que conocer para no leer mal una cifra (misma
 * doctrina que el aviso de `truncated` en ModuleBillingSummary).
 */
const SyncNotices = ({ fanvue, meta }: SyncNoticesProps) => {
    const notices: {
        key: string
        type: 'info' | 'warning'
        body: React.ReactNode
    }[] = []

    if (meta.truncated) {
        notices.push({
            key: 'truncated',
            type: 'warning',
            body: 'Hay más datos en este período de los que se pudieron leer de una vez: los totales pueden estar incompletos.',
        })
    }
    if (fanvue.connected && fanvue.mappedCreators === 0) {
        notices.push({
            key: 'unmapped',
            type: 'warning',
            body: (
                <>
                    Fanvue está conectado pero ningún avatar tiene un creator
                    asignado, así que no hay ingresos de Fanvue que mostrar.{' '}
                    <Link
                        href={ROUTES.fanvueAccounts}
                        className="font-semibold underline"
                    >
                        Asignar creators
                    </Link>
                </>
            ),
        })
    } else if (fanvue.connected && fanvue.lastSyncedAt === null) {
        notices.push({
            key: 'first-sync',
            type: 'info',
            body: 'El historial de Fanvue aparecerá tras la primera sincronización (cada hora, o ahora con "Actualizar").',
        })
    } else if (meta.todayIncomplete) {
        notices.push({
            key: 'today',
            type: 'info',
            body: 'Los ingresos de Fanvue de hoy pueden estar incompletos hasta la próxima sincronización.',
        })
    }

    if (notices.length === 0) return null
    return (
        <div className="flex flex-col gap-3">
            {notices.map((n) => (
                <Alert key={n.key} type={n.type} showIcon>
                    {n.body}
                </Alert>
            ))}
        </div>
    )
}

export default SyncNotices
