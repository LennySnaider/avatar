import Link from 'next/link'
import Badge from '@/components/ui/Badge'
import Card from '@/components/ui/Card'
import Tag from '@/components/ui/Tag'
import type {
    FanvueSyncStatus,
    TelegramStatus,
} from '@/services/EarningsService'
import { ROUTES } from './constants'
import type { ReactNode } from 'react'

interface ConnectionStatusCardProps {
    fanvue: FanvueSyncStatus
    telegram: TelegramStatus
    /** Sólo en Inicio: cuántos avatares tuvieron ingresos en el período. */
    activity?: { activeAvatars: number; totalAvatars: number }
    /** Sólo en la página de avatar: sus vínculos concretos. */
    avatar?: {
        fanvueCreatorHandle: string | null
        telegramBotUsername: string | null
        telegramBotEnabled: boolean
    }
}

const Row = ({
    connected,
    title,
    detail,
    href,
    extra,
}: {
    connected: boolean
    title: string
    detail: ReactNode
    href: string
    extra?: ReactNode
}) => (
    <div className="flex items-start justify-between gap-3 py-3 border-b last:border-b-0 border-gray-200 dark:border-gray-600">
        <div className="flex items-start gap-2 min-w-0">
            <Badge
                className={
                    connected ? 'bg-emerald-500 mt-1.5' : 'bg-gray-400 mt-1.5'
                }
            />
            <div className="min-w-0">
                <div className="heading-text font-semibold">{title}</div>
                <div className="text-xs text-gray-500">{detail}</div>
                {extra && <div className="mt-1">{extra}</div>}
            </div>
        </div>
        <Link
            href={href}
            className="text-sm font-semibold text-primary hover:underline shrink-0"
        >
            Gestionar
        </Link>
    </div>
)

const ConnectionStatusCard = ({
    fanvue,
    telegram,
    activity,
    avatar,
}: ConnectionStatusCardProps) => {
    const fanvueDetail = avatar
        ? avatar.fanvueCreatorHandle
            ? `Creator @${avatar.fanvueCreatorHandle}`
            : fanvue.connected
              ? 'Sin creator asignado a este avatar'
              : 'No conectado'
        : fanvue.connected
          ? `${fanvue.mappedCreators} creator${fanvue.mappedCreators === 1 ? '' : 's'} asignado${fanvue.mappedCreators === 1 ? '' : 's'}${
                fanvue.selfAvatars > 0
                    ? ` · ${fanvue.selfAvatars} sin asignar`
                    : ''
            }`
          : 'No conectado'
    const telegramDetail = avatar
        ? avatar.telegramBotUsername
            ? `Bot @${avatar.telegramBotUsername}${avatar.telegramBotEnabled ? '' : ' (desconectado)'}`
            : telegram.installed
              ? 'Sin bot conectado'
              : 'Módulo no instalado'
        : telegram.installed
          ? `${telegram.bots} bot${telegram.bots === 1 ? '' : 's'} activo${telegram.bots === 1 ? '' : 's'}`
          : 'Módulo no instalado'

    return (
        <Card>
            <h4 className="mb-2">Estado de conexiones</h4>
            <Row
                connected={
                    avatar
                        ? Boolean(avatar.fanvueCreatorHandle)
                        : fanvue.connected
                }
                title="Fanvue"
                detail={fanvueDetail}
                href={ROUTES.fanvueAccounts}
                extra={
                    fanvue.connected && !fanvue.hasInsightsScope ? (
                        <Tag className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-100 border-0">
                            Desglose por tipo: pendiente de reconexión
                        </Tag>
                    ) : undefined
                }
            />
            <Row
                connected={
                    avatar
                        ? Boolean(
                              avatar.telegramBotUsername &&
                              avatar.telegramBotEnabled,
                          )
                        : telegram.bots > 0
                }
                title="Telegram"
                detail={telegramDetail}
                href={telegram.installed ? ROUTES.telegram : ROUTES.modules}
            />
            {activity && (
                <p className="text-sm text-gray-500 mt-3">
                    <span className="heading-text font-bold">
                        {activity.activeAvatars}
                    </span>{' '}
                    de {activity.totalAvatars} avatares con ingresos en el
                    período.
                </p>
            )}
        </Card>
    )
}

export default ConnectionStatusCard
