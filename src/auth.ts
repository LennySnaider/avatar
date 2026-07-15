import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import appConfig from '@/configs/app.config'
import authConfig from '@/configs/auth.config'
import validateCredential from '@/server/actions/user/validateCredential'
import { provisionOAuthUser } from '@/lib/auth/provisionOAuthUser'
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
        async jwt({ token, user, account, profile }) {
            if (user) {
                token.authority = user.authority
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
