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
