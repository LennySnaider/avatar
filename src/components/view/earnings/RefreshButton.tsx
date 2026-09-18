'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { TbRefresh } from 'react-icons/tb'
import { refreshEarnings } from '@/services/EarningsService'
import { formatRelativeTime } from './format'
import { usePendingTransition } from './PendingFrame'

interface RefreshButtonProps {
    fanvueConnected: boolean
    lastSyncedAt: string | null
    /** Resaltar el botón (p.ej. cuando Fanvue nunca se ha sincronizado). */
    emphasis?: boolean
}

/**
 * Relee Fanvue (ayer y hoy) para la org y vuelve a renderizar la página. Las
 * ventas de Telegram ya se agregan en vivo, así que sin Fanvue conectado el
 * botón sólo refresca la vista.
 */
const RefreshButton = ({
    fanvueConnected,
    lastSyncedAt,
    emphasis,
}: RefreshButtonProps) => {
    const router = useRouter()
    const { isPending, startTransition } = usePendingTransition()
    const [busy, setBusy] = useState(false)
    // El tiempo relativo se calcula en el cliente tras montar: en el servidor
    // el reloj es otro y el texto no coincidiría en la hidratación.
    const [caption, setCaption] = useState<string | null>(null)
    useEffect(() => {
        if (!fanvueConnected) {
            setCaption(null)
            return
        }
        const update = () =>
            setCaption(
                `Última sincronización Fanvue: ${formatRelativeTime(lastSyncedAt)}`,
            )
        update()
        const timer = window.setInterval(update, 60_000)
        return () => window.clearInterval(timer)
    }, [fanvueConnected, lastSyncedAt])

    const handleClick = async () => {
        setBusy(true)
        try {
            if (fanvueConnected) {
                const result = await refreshEarnings()
                if (!result.success) {
                    toast.push(
                        <Notification
                            type="danger"
                            title="No se pudo sincronizar Fanvue"
                        >
                            {result.error}
                        </Notification>,
                    )
                } else if (result.data?.throttledUntil) {
                    toast.push(
                        <Notification type="info" title="Espera un momento">
                            Fanvue se sincronizó hace menos de un minuto.
                        </Notification>,
                    )
                } else {
                    toast.push(
                        <Notification
                            type="success"
                            title="Fanvue sincronizado"
                        >
                            Ingresos de ayer y hoy actualizados.
                        </Notification>,
                    )
                }
            }
            startTransition(() => router.refresh())
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="flex flex-col items-start md:items-end gap-1">
            <Button
                size="sm"
                variant={emphasis ? 'solid' : 'default'}
                icon={<TbRefresh />}
                loading={busy || isPending}
                onClick={handleClick}
            >
                Actualizar
            </Button>
            {caption && (
                <span
                    className="text-xs text-gray-500"
                    suppressHydrationWarning
                >
                    {caption}
                </span>
            )}
        </div>
    )
}

export default RefreshButton
