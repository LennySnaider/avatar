'use server'
import { auth } from '@/auth'
import { readUserProfile } from '@/lib/auth/userProfile'

/**
 * Perfil REAL del usuario logueado para Settings > Profile.
 *
 * POR QUE EXISTE (y por que se borró `GET /api/setting/profile`): esa ruta
 * devolvia `profileData` de `src/mock/data/accountsData` — Angelina Gotelli,
 * carolyn_h@hotmail.com, 123 Main St. La pantalla no enseñaba el perfil de
 * nadie, enseñaba el del maquetado, y encima fingia guardarlo. Su unico
 * consumidor era `apiGetSettingsProfile`, y su unico consumidor era
 * `SettingsProfile`.
 *
 * POR QUE SERVER ACTION Y NO CONVERTIR LA RUTA EN LECTURA REAL: la ruta no
 * tenia (ni podia tener facilmente) nocion de "quien pregunta". Para devolver
 * datos de verdad habria necesitado su propio `auth()` y su propia decision
 * sobre que hacer sin sesion — es decir, reimplementar dentro de un endpoint
 * publico el control que la server action recibe gratis. Ademas el middleware
 * exime `/api/auth/**` y deja el resto de `/api` bajo redirect de sesion: una
 * ruta de API para leer TU PROPIO perfil es superficie nueva sin nada a cambio.
 * El id sale de la sesion en el servidor, igual que en `changePassword`.
 */

export interface UserProfile {
    /** Cadena vacia cuando la fila no tiene nombre: el input necesita un string. */
    name: string
    email: string
}

export interface GetProfileResult {
    success: boolean
    /** Sólo presente cuando `success` es true. */
    profile?: UserProfile
    /** Sólo presente cuando `success` es false. */
    message?: string
}

const getProfile = async (): Promise<GetProfileResult> => {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) {
        return {
            success: false,
            message: 'Your session has expired. Please sign in again.',
        }
    }

    try {
        const profile = await readUserProfile(userId)

        if (!profile) {
            console.error(`getProfile: no users row for session id ${userId}`)
            return {
                success: false,
                message:
                    'Your session is no longer valid. Please sign in again.',
            }
        }

        return {
            success: true,
            profile: {
                // `name` puede ser NULL en la base. Se devuelve '' y NO el
                // email: el email como valor por defecto del campo "Name"
                // invitaria a guardarlo como nombre sin querer. El formulario
                // enseña un placeholder en su lugar.
                name: profile.name ?? '',
                email: profile.email,
            },
        }
    } catch (error) {
        console.error(
            'getProfile lookup failed:',
            error instanceof Error ? error.message : error,
        )
        return {
            success: false,
            message: 'We could not load your profile. Please try again.',
        }
    }
}

export default getProfile
