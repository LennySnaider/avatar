import type { ReactNode } from 'react'
import { pageCan } from '@/lib/org/pageGuard'
import NoAccess from '@/components/shared/NoAccess'

/**
 * Gate de rol para toda esta rama: conectar y desconectar cuentas es
 * `connection:manage` (admin y owner). Un operator que aterrizase aquí vería
 * una pantalla cuyos botones fallan todos; mejor decirlo. El gate real de los
 * datos sigue siendo `requirePermission` en cada server action.
 */
export default async function ConnectionsLayout({
    children,
}: {
    children: ReactNode
}) {
    if (await pageCan('connection:manage')) return <>{children}</>
    return <NoAccess permission="connection:manage" />
}
