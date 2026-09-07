import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import appConfig from '@/configs/app.config'
import authConfig from '@/configs/auth.config'
import validateCredential from '@/server/actions/user/validateCredential'
import { provisionOAuthUser } from '@/lib/auth/provisionOAuthUser'
import { readUserProfile } from '@/lib/auth/userProfile'
import { getPasswordChangedAt } from '@/lib/auth/passwordChangedAt'
import { isSessionRevoked } from '@/lib/auth/sessionRevocation'
import type { SignInCredential } from '@/@types/auth'

/**
 * Full NextAuth setup (Node runtime only). auth.config.ts stays edge-safe
 * for middleware; everything that touches the database lives here:
 *  - Credentials: validated against the `users` table (scrypt hash).
 *  - OAuth (GitHub/Google): provisioned into `users` + own organization on
 *    first sign-in; blocked when the email already belongs to another
 *    provider's account (no silent auto-linking).
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
    pages: {
        signIn: appConfig.authenticatedEntryPath,
        error: appConfig.authenticatedEntryPath,
    },
    ...authConfig,
    providers: [
        ...authConfig.providers,
        Credentials({
            async authorize(credentials) {
                const user = await validateCredential(
                    credentials as SignInCredential,
                )
                if (!user) {
                    return null
                }
                return {
                    id: user.id,
                    name: user.userName,
                    email: user.email,
                    image: user.avatar,
                    authority: user.authority,
                }
            },
        }),
    ],
    callbacks: {
        ...authConfig.callbacks,
        async signIn({ account, user, profile }) {
            if (!account || account.provider === 'credentials') return true
            // OAuth: resolve/create the users row; block the sign-in when
            // provisioning refuses (no email / email owned by another provider).
            const dbUser = await provisionOAuthUser({
                provider: account.provider,
                providerAccountId: account.providerAccountId,
                email: user?.email ?? (profile as { email?: string })?.email,
                name: user?.name,
                image: user?.image,
            })
            return !!dbUser
        },
        async jwt({ token, user, account, profile, trigger }) {
            if (user) {
                token.authority = user.authority
                /**
                 * SELLO DE INICIO DE SESION. Se escribe UNA sola vez, aqui, en
                 * el login (`user` solo llega en el login), y sobrevive intacto
                 * a todas las re-firmas posteriores de la cookie.
                 *
                 * POR QUE NO VALE EL `iat` DEL JWT: Auth.js re-firma el token en
                 * cada lectura de sesion y su `encode` llama a `.setIssuedAt()`
                 * cada vez (node_modules/@auth/core/jwt.js:57). O sea que `iat`
                 * avanza solo con que el navegador siga usando la app: un
                 * intruso activo tendria `iat` siempre fresco y no se le
                 * expulsaria NUNCA. Este claim no se toca despues de escribirse.
                 */
                token.sessionStartedAt = Date.now()
            } else if (token.sub) {
                /**
                 * EXPULSION DE SESIONES ANTERIORES A UN CAMBIO DE CONTRASENA.
                 *
                 * El problema que cierra: sin adapter, la sesion es un JWT en la
                 * cookie y no se consulta contra la base, asi que cambiar la
                 * contrasena no echaba a nadie. Quien la cambia PORQUE sospecha
                 * de un intruso conseguia lo contrario de lo que creia — el
                 * intruso seguia dentro hasta que su token caducase solo.
                 *
                 * Devolver `null` aqui destruye la sesion Y borra la cookie
                 * (verificado en node_modules/@auth/core/lib/actions/session.js:
                 * `token !== null ? ... : sessionStore.clean()`).
                 *
                 * NO se comprueba en el login (`if (user)`): las credenciales
                 * se acaban de validar contra el hash vigente, la sesion es por
                 * definicion posterior al ultimo cambio, y saltarselo ahorra una
                 * lectura en el camino mas caro.
                 *
                 * COSTE: `getPasswordChangedAt` cachea 30 s en memoria del
                 * proceso, asi que esto NO es una lectura de base por request
                 * (este callback corre en cada uno de los 41 `auth()` del arbol)
                 * sino como mucho 2 por usuario activo y minuto por instancia
                 * caliente. La contrapartida es que la expulsion tarda hasta
                 * 30 s en las instancias que no atendieron el cambio — 0 s en la
                 * que lo atendio, que siembra su cache. Ver passwordChangedAt.ts.
                 *
                 * UN FALLO DE BASE NO CIERRA LA SESION DE NADIE: se registra y
                 * el token sigue vivo, mismo criterio que la rama `update` de
                 * abajo. Una caida de Postgres o un corte de red no puede echar
                 * a la gente de la app; el precio es una ventana en la que la
                 * expulsion no se aplica, y ese precio es el correcto.
                 */
                try {
                    if (
                        isSessionRevoked({
                            sessionStartedAt: token.sessionStartedAt,
                            passwordChangedAt: await getPasswordChangedAt(
                                token.sub,
                            ),
                        })
                    ) {
                        return null
                    }
                } catch (error) {
                    console.error(
                        'jwt: no se pudo comprobar la invalidacion de sesion:',
                        error instanceof Error ? error.message : error,
                    )
                }
            }
            /**
             * `trigger === 'update'` = alguien llamó a `useSession().update()`
             * desde el cliente. Lo hace Settings > Profile despues de guardar
             * el nombre.
             *
             * POR QUE HACE FALTA: el nombre que pintan la cabecera, el menu de
             * usuario y el SideNav sale del JWT, no de la base. Guardar en
             * `users` y no tocar el token deja al usuario viendo "Saved" y su
             * nombre VIEJO en la esquina hasta que vuelva a entrar — la app
             * afirmando algo que la propia pantalla desmiente.
             *
             * POR QUE SE RELEE DE LA BASE Y NO SE USA EL `session` QUE LLEGA:
             * ese objeto lo pone el cliente en el body de POST
             * /api/auth/session, sin pasar por ninguna validacion. Copiarlo al
             * token permitiria escribir en la cabecera un nombre que no es el
             * guardado — la misma clase de mentira, ahora al reves. La fila es
             * la fuente de verdad; ademas asi el token se autocorrige si el
             * nombre cambió por otra via.
             *
             * `trigger === 'update'` llega SIN `user` ni `account`, asi que la
             * unica clave disponible es `token.sub` (que el bloque OAuth de
             * abajo ya garantiza que es nuestro `users.id`).
             *
             * Un fallo de base aqui NO tumba la sesion: se registra y el token
             * se queda como estaba. Perder el refresco del nombre es molesto;
             * devolver `null` cerraria la sesion del usuario por un problema de
             * red.
             */
            if (trigger === 'update' && token.sub) {
                try {
                    const dbProfile = await readUserProfile(token.sub)
                    if (dbProfile) {
                        token.name = dbProfile.name ?? dbProfile.email
                    }
                } catch (error) {
                    console.error(
                        'jwt update trigger: could not re-read profile:',
                        error instanceof Error ? error.message : error,
                    )
                }
            }
            if (account && account.provider !== 'credentials') {
                // Re-resolve (idempotent, hits the unique provider-account
                // index) so token.sub is OUR stable users.id — not the raw
                // provider profile id — matching avatars/org_members keys.
                const dbUser = await provisionOAuthUser({
                    provider: account.provider,
                    providerAccountId: account.providerAccountId,
                    email: user?.email ?? (profile as { email?: string })?.email,
                    name: user?.name,
                    image: user?.image,
                })
                if (dbUser) {
                    token.sub = dbUser.id
                    token.authority = dbUser.authority
                }
            }
            return token
        },
    },
})
