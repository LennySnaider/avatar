'use client'

/**
 * Oculta su contenido si el rol del usuario no tiene el permiso.
 *
 * Calcado de `ModuleCheck` y con el mismo alcance: ES COSMÉTICO. Lo que
 * autoriza de verdad es `requirePermission` dentro de la server action, que
 * re-consulta la membresía. Esto sólo evita enseñar un botón que va a fallar.
 *
 * A diferencia de `AuthorityCheck` (otro eje: `users.authority`, y falla
 * abierto), sin rol resuelto OCULTA.
 */
import type { ReactNode } from 'react'
import { usePermission } from '@/components/template/Navigation/NavigationContext'
import type { Permission } from '@/lib/org/permissions'

interface RoleCheckProps {
    permission: Permission
    children: ReactNode
    fallback?: ReactNode
}

export default function RoleCheck({
    permission,
    children,
    fallback = null,
}: RoleCheckProps) {
    return <>{usePermission(permission) ? children : fallback}</>
}
