import type { NextAuthConfig } from 'next-auth'
import Github from 'next-auth/providers/github'
import Google from 'next-auth/providers/google'

/**
 * EDGE-SAFE config — this module is bundled into middleware.ts (edge
 * runtime), so it must not import Node APIs or the Supabase server client.
 * The Credentials provider (validates against the users table with
 * node:crypto scrypt) and the OAuth DB provisioning live in src/auth.ts,
 * which only runs in the Node runtime.
 */
export default {
    providers: [
        Github({
            clientId: process.env.GITHUB_AUTH_CLIENT_ID,
            clientSecret: process.env.GITHUB_AUTH_CLIENT_SECRET,
        }),
        Google({
            clientId: process.env.GOOGLE_AUTH_CLIENT_ID,
            clientSecret: process.env.GOOGLE_AUTH_CLIENT_SECRET,
        }),
    ],
    callbacks: {
        async jwt({ token, user }) {
            // Persist the authority to the token right after signin
            if (user) {
                token.authority = user.authority
            }
            // NOTE: the `trigger === 'update'` branch (re-reads the display
            // name from `users` after Settings > Profile saves it) deliberately
            // lives ONLY in src/auth.ts — it hits the database, which this
            // edge-bundled module must never do. This copy is what middleware
            // runs, and middleware only decodes an existing token: the update
            // trigger reaches the /api/auth/session handler, which is built
            // from src/auth.ts.
            //
            // ─────────────────────────────────────────────────────────────────
            // AGUJERO CONOCIDO Y ACEPTADO: EL MIDDLEWARE NO VE LAS REVOCACIONES
            // ─────────────────────────────────────────────────────────────────
            //
            // La expulsion de sesiones tras un cambio de contrasena (comparar
            // el claim `sessionStartedAt` contra `users.password_changed_at`)
            // vive SOLO en el callback `jwt` de src/auth.ts, porque necesita
            // leer Postgres y este modulo se empaqueta en el middleware (edge):
            // aqui no se puede consultar la base, ni siquiera una vez.
            //
            // CONSECUENCIA, dicha sin adornos: un token YA REVOCADO sigue
            // pasando el `isSignedIn` del middleware. Para el middleware ese
            // token es valido — su firma lo es— y no redirige a /sign-in. La
            // sesion no muere hasta que algo en runtime Node llama a `auth()`:
            // un server component, una server action o una ruta de API. Ahi si
            // corre el callback de src/auth.ts, devuelve `null`, y la cookie se
            // borra.
            //
            // QUE SE PUEDE Y QUE NO SE PUEDE HACER CON UN TOKEN REVOCADO EN ESA
            // VENTANA: los datos de esta app salen todos por server actions y
            // rutas de API que llaman a `auth()` / `getOrgContext()` (24
            // ficheros), y todas esas llamadas SI ejecutan la comprobacion. Lo
            // que se cuela es la navegacion en si: paginas que no consultan
            // nada del servidor, y el hecho de no ser redirigido al login.
            //
            // ESTADO (06-sep-2026): CERRADO por la via 3, la unica sin
            // coste en el edge. `src/app/(protected-pages)/layout.tsx` es un
            // server component que llama a `auth()` y redirige cuando devuelve
            // null. Por ahi pasa TODA pagina protegida, asi que un token
            // revocado ya no puede navegar: el middleware lo deja entrar, pero
            // el layout lo echa antes de pintar nada.
            //
            // LO QUE SIGUE SIENDO CIERTO Y CONVIENE NO OLVIDAR: este modulo NO
            // ve las revocaciones y nunca podra verlas mientras se empaquete en
            // el edge. Si algun dia aparece una pagina protegida FUERA del
            // grupo `(protected-pages)`, quedara con el mismo hueco que tuvimos
            // aqui — la proteccion vive en ese layout, no en el middleware.
            //
            // Las otras dos salidas quedan descartadas, no pendientes:
            //   1. Lista de revocaciones en Edge Config / KV: cerraria tambien
            //      el middleware, pero anade una lectura de RED a cada request
            //      de la app. Desproporcionado para lo que cierra.
            //   2. Bajar `session.maxAge`: no revoca nada, solo acorta el
            //      plazo maximo. Mitiga, no resuelve.
            return token
        },
        async session({ session, token }) {
            // Send properties to the client
            return {
                ...session,
                user: {
                    ...session.user,
                    id: token.sub,
                    authority: token.authority,
                },
            }
        },
    },
} satisfies NextAuthConfig
