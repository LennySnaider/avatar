/**
 * Gate por RAMA de rutas: "¿puede el que mira entrar en esta sección?"
 *
 * Para los `layout.tsx` de las ramas que un rol entero no debe ver (hoy, las
 * de conexiones: cuentas sociales, Fanvue, proveedores). Mismo criterio que
 * `telegram/layout.tsx`: nunca un 404, la ruta existe y lo útil es explicar.
 *
 * NO autoriza datos: eso lo hace `requirePermission` en cada server action.
 * Esto evita que un operator aterrice en una pantalla cuyos botones fallarán
 * todos. Sin contexto (sesión sin membresía) devuelve false y deja rastro; el
 * layout de `(protected-pages)` ya redirige ese caso antes de llegar aquí.
 */
import { getOrgContext } from '@/lib/tenant/getOrgContext'
import { ctxCan } from './guards'
import type { Permission } from './permissions'

export async function pageCan(permission: Permission): Promise<boolean> {
    try {
        return ctxCan(await getOrgContext(), permission)
    } catch (e) {
        console.warn('[pageGuard] sin contexto de organización', e)
        return false
    }
}
