import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase'

export interface OAuthProfileInput {
    provider: string
    providerAccountId: string
    email?: string | null
    name?: string | null
    image?: string | null
}

export interface ProvisionedUser {
    id: string
    authority: string[]
}

/**
 * Resolve (or create) the `users` row for an OAuth sign-in (GitHub/Google).
 * Idempotent — safe to call from both the signIn and jwt callbacks.
 *
 * Returns null when the sign-in must be BLOCKED:
 *  - the provider gave no email (we can't key an account), or
 *  - the email already belongs to an account from a DIFFERENT provider
 *    (no silent auto-linking — that would let an OAuth signer take over a
 *    credentials account with the same address).
 */
export async function provisionOAuthUser(
    p: OAuthProfileInput,
): Promise<ProvisionedUser | null> {
    const supabase = createServerSupabaseClient() as unknown as SupabaseClient

    // 1. Known provider account → done.
    const { data: byAccount } = await supabase
        .from('users')
        .select('id, authority')
        .eq('provider', p.provider)
        .eq('provider_account_id', p.providerAccountId)
        .maybeSingle()
    if (byAccount) return byAccount as ProvisionedUser

    const email = p.email?.trim().toLowerCase()
    if (!email) {
        console.warn(`OAuth sign-in without email blocked (${p.provider})`)
        return null
    }

    // 2. Same email from another provider → block (no auto-linking).
    const emailPattern = email.replace(/[%_\\]/g, '\\$&')
    const { data: byEmail } = await supabase
        .from('users')
        .select('id, provider')
        .ilike('email', emailPattern)
        .maybeSingle()
    if (byEmail) {
        console.warn(
            `OAuth sign-in blocked: ${email} already registered via ${(byEmail as { provider: string }).provider}`,
        )
        return null
    }

    // 3. First sign-in → create user + own org + owner membership so
    //    getOrgContext() resolves immediately.
    const userId = randomUUID()
    const displayName = p.name?.trim() || email.split('@')[0]
    const { error: userErr } = await supabase.from('users').insert({
        id: userId,
        email,
        name: displayName,
        image: p.image ?? null,
        provider: p.provider,
        provider_account_id: p.providerAccountId,
        authority: ['user'],
    })
    if (userErr) {
        console.error('OAuth user creation failed:', userErr.message)
        return null
    }

    const slugBase =
        displayName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 40) || 'org'
    const { data: org, error: orgErr } = await supabase
        .from('organizations')
        .insert({
            name: `${displayName}'s Workspace`,
            slug: `${slugBase}-${randomUUID().slice(0, 8)}`,
        })
        .select('id')
        .single()
    if (orgErr) {
        console.error('OAuth org creation failed:', orgErr.message)
        return null
    }
    const { error: memberErr } = await supabase
        .from('organization_members')
        .insert({
            organization_id: (org as { id: string }).id,
            user_id: userId,
            role: 'owner',
        })
    if (memberErr) {
        console.error('OAuth membership creation failed:', memberErr.message)
        return null
    }

    return { id: userId, authority: ['user'] }
}
