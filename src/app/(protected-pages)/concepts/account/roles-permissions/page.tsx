import { listTeam } from '@/services/OrgMembersService'
import { getSupportAccess } from '@/services/SupportAccessService'
import MembersClient from './_components/MembersClient'
import SupportAccessCard from './_components/SupportAccessCard'

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
    // F4.4 — El acceso de soporte vive junto a los miembros porque es la misma
    // pregunta: quién puede entrar en esta organización. Se carga aparte y se
    // degrada a nada si falla: un problema leyendo las concesiones no debe
    // dejar al propietario sin poder administrar su equipo.
    const soporte = await getSupportAccess()

    return (
        <>
            <MembersClient initial={res.data} />
            {soporte.success && soporte.data && (
                <SupportAccessCard initial={soporte.data} />
            )}
        </>
    )
}
