/**
 * Tenant resolution (Phase 0 of the multitenant roadmap).
 *
 * Pattern ported from agentsoft's getAuthContext/getOrgContext, adapted to
 * NextAuth: session.user.id → organization_members → organizationId. Data
 * access stays on the service-role client with MANUAL
 * `.eq('organization_id', ...)` scoping (RLS-without-policies is only an
 * anti-anon backstop in this repo).
 *
 * Every NEW service (agent module onward) opens with `await getOrgContext()`
 * and writes/filters `organization_id`. Existing single-user services migrate
 * in the multitenant phase.
 */
import { auth } from '@/auth'
import { agentSupabase, type OrgMemberRole } from '@/lib/agent/db'

export interface OrgContext {
    userId: string
    organizationId: string
    role: OrgMemberRole
}

/** Resolve the current session's org membership. Throws if unauthenticated or memberless. */
export async function getOrgContext(): Promise<OrgContext> {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) throw new Error('Not authenticated')
    const ctx = await getOrgContextForUser(userId)
    if (!ctx) throw new Error('No organization membership for this user')
    return ctx
}

/**
 * Session-less variant for webhooks/cron, where the user is resolved from
 * data (e.g. a connection row) instead of cookies.
 */
export async function getOrgContextForUser(userId: string): Promise<OrgContext | null> {
    const supabase = agentSupabase()
    const { data, error } = await supabase
        .from('organization_members')
        .select('organization_id, role')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null
    return { userId, organizationId: data.organization_id, role: data.role }
}
