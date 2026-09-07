import { DefaultSession, DefaultUser } from 'next-auth'
import { DefaultJWT } from 'next-auth/jwt'

declare module 'next-auth' {
    interface Session {
        user: {
            id: string
            authority: string[] /** add extra user attributes here */
        } & DefaultSession['user']
    }

    interface User extends DefaultUser {
        authority: string[]
    }
}

declare module 'next-auth/jwt' {
    interface JWT extends DefaultJWT {
        authority: string[]
        /**
         * Instante (ms) en que se INICIO esta sesion, sellado una sola vez en
         * el login por el callback `jwt` de src/auth.ts. Es lo que se compara
         * contra `users.password_changed_at` para expulsar a las sesiones
         * anteriores a un cambio de contrasena.
         *
         * OPCIONAL a proposito: los tokens emitidos antes de que esto existiera
         * no lo llevan, y esos NO se revocan (ver sessionRevocation.ts).
         *
         * NO se usa el `iat` estandar del JWT porque Auth.js lo re-sella en
         * cada re-firma de la cookie: `iat` dice cuando se escribio la cookie
         * por ultima vez, no cuando empezo la sesion.
         */
        sessionStartedAt?: number
    }
}