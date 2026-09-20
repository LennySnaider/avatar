'use client'

/**
 * ⚠️ NO ES CONTROL DE ACCESO. Es un ayudante de PINTADO de la plantilla ECME,
 * y además FALLA ABIERTO: con cualquiera de las dos listas vacía devuelve
 * `true` (ver el `return !emptyCheck` de abajo).
 *
 * Opera sobre `users.authority`, que en este producto es un eje MUERTO: todo
 * usuario nace con `['user']` (`api/auth/sign-up`) y todos los ítems de menú
 * piden `[ADMIN, USER]`, así que no filtra absolutamente nada. Sigue aquí
 * porque lo usan los componentes de menú de la plantilla y sus páginas de
 * documentación, no porque decida nada.
 *
 * LO QUE SÍ AUTORIZA en este repo:
 *  - `requirePermission(ctx, …)` de `@/lib/org/guards` — rol de organización,
 *    falla cerrado, ~121 puntos de uso; su equivalente de pintado es
 *    `RoleCheck`/`usePermission`, que también falla cerrado.
 *  - `requirePlatformAdmin()` de `@/lib/platform/guards` — admin del sistema.
 *
 * Si estás buscando dónde impedir que alguien haga algo, no es aquí.
 */

import { useMemo } from 'react'
import isEmpty from 'lodash/isEmpty'

function useAuthority(
    userAuthority: string[] = [],
    authority: string[] = [],
    emptyCheck = false,
) {
    const roleMatched = useMemo(() => {
        return authority.some((role) => userAuthority.includes(role))
    }, [authority, userAuthority])

    if (
        isEmpty(authority) ||
        isEmpty(userAuthority) ||
        typeof authority === 'undefined'
    ) {
        return !emptyCheck
    }

    return roleMatched
}

export default useAuthority
