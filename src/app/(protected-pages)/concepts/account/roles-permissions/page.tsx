import { listTeam } from '@/services/OrgMembersService'
import MembersClient from './_components/MembersClient'

/**
 * Miembros de la organización: quién está, con qué rol, las invitaciones
 * pendientes y los asientos del plan.
 *
 * Ocupa la ruta `roles-permissions` que antes tenía la maqueta de la plantilla
 * (datos de `@/mock/data/usersData` y un aviso de "nada aquí concede acceso").
 * La ruta ya estaba registrada y traducida, y mantener las dos pantallas
 * garantizaba que alguien administrase su organización en la falsa.
 *
 * Patrón de `account/modules/page.tsx`: el servidor carga con la server
 * action (que es quien autoriza) y el cliente pinta con lo que recibe.
 */
export default async function RolesPermissionsPage() {
    const res = await listTeam()
    if (!res.success || !res.data) {
        return (
            <div className="p-6 text-red-500">
                {res.error ?? 'No se pudo cargar la organización.'}
            </div>
        )
    }
    return <MembersClient initial={res.data} />
}
