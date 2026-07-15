import { auth } from '@/auth'

/**
 * Resolve the authenticated user's id server-side (NextAuth session).
 * Throws when unauthenticated. Single source of truth — replaces the
 * `requireSession()` copies that lived inline in SocialService /
 * FanvueService / AvatarForgeService.
 *
 * SECURITY: server actions must derive identity from THIS, never from a
 * client-supplied `userId` argument (spoofable at the network layer).
 * When multitenancy lands (F4), callers migrate to `getOrgContext()`.
 */
export async function requireUserId(): Promise<string> {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) throw new Error('Not authenticated')
    return userId
}
