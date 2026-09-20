import { redirect } from 'next/navigation'
import { tryPlatformContext } from '@/lib/platform/guards'
import { listOrganizations } from '@/lib/platform/platformDb'
import { latestGrantFor } from '@/lib/platform/platformDb'
import { isGrantLive } from '@/lib/platform/supportGrant'
import PlatformOrgsClient from './_components/PlatformOrgsClient'

/**
 * EL PANEL DE PLATAFORMA (F4.4) — la pantalla que sustituye al SQL a mano.
 *
 * Vive dentro de `(protected-pages)` y no en un grupo `(platform)` propio,
 * apartándose de la letra del SUPER-PLAN §4.4 a propósito: ahí hereda el shell
 * del producto (tema, navegación, cabecera) y, sobre todo, el
 * `ViewingAsBanner`. Un grupo hermano habría obligado a duplicar el layout
 * entero para volver a montar lo mismo.
 *
 * La guarda está DOS veces y ninguna sobra: aquí, para no pintar la pantalla a
 * quien no debe verla, y dentro de cada acción de `PlatformService`, porque
 * esconder una página no es autorizar nada — un POST a la server action no
 * pasa por este componente.
 */
const PlatformPage = async () => {
    const platform = await tryPlatformContext()
    if (!platform) redirect('/access-denied')

    const orgs = await listOrganizations()

    // Qué organizaciones tienen la puerta abierta ahora mismo. Se consulta por
    // organización porque `support_grants` no tiene una vista agregada y el
    // volumen aquí es de decenas: cuando sean cientos, esto pasa a ser una
    // sola consulta con `distinct on`.
    const vivas = await Promise.all(
        orgs.map(async (o) => {
            try {
                return isGrantLive(await latestGrantFor(o.id), new Date())
                    ? o.id
                    : null
            } catch {
                // Un fallo leyendo una concesión no debe tumbar la lista
                // entera: se pinta como "sin concesión", que es lo seguro.
                return null
            }
        }),
    )

    return (
        <PlatformOrgsClient
            orgs={orgs}
            withLiveGrant={vivas.filter((x): x is string => x !== null)}
        />
    )
}

export default PlatformPage
