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

    const userId = randomUUID()
    const displayName = p.name?.trim() || email.split('@')[0]

    // 3. ¿Hay una invitación VIVA para este email? Entonces esta persona no
    //    es un usuario nuevo con organización propia: es un invitado que, en
    //    vez de abrir el enlace, entró con Google. Antes de esta rama se le
    //    creaba usuario + organización PROPIA + rol owner: acababa en una
    //    organización vacía convencido de estar en la que le invitaron, la
    //    invitación seguía ocupando asiento, y al día siguiente el enlace le
    //    decía "ese email ya tiene cuenta".
    //
    //    Se acepta por la MISMA RPC que el camino con contraseña: misma
    //    transacción, mismo `for update` sobre la organización, mismo tope de
    //    asientos. Sin contraseña (password_hash NULL, como todo alta por
    //    OAuth) y con el id de la cuenta del proveedor, que es lo que el paso
    //    1 usa para reconocerla en el siguiente login.
    const { data: invitation, error: invError } = await supabase
        .from('organization_invitations')
        .select('token_hash')
        .eq('email', email)
        .is('accepted_at', null)
        .is('revoked_at', null)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle()
    if (invError) {
        // Sin saber si hay invitación no se puede elegir camino: crear una
        // organización propia "por si acaso" es exactamente el agujero.
        console.error(
            'OAuth: no se pudo consultar invitaciones:',
            invError.message,
        )
        return null
    }
    if (invitation) {
        const { data, error } = await supabase.rpc(
            'accept_organization_invitation',
            {
                p_token_hash: (invitation as { token_hash: string }).token_hash,
                p_user_id: userId,
                p_name: displayName,
                p_password_hash: null,
                p_provider: p.provider,
                p_provider_account_id: p.providerAccountId,
                p_image: p.image ?? null,
            },
        )
        if (error) {
            console.error('OAuth: aceptar la invitación falló:', error.message)
            return null
        }
        const result = data as { ok: boolean; reason?: string }
        if (result.ok) return { id: userId, authority: ['user'] }
        // `no_seats`: no se le crea una organización propia (sería el agujero
        // otra vez); se bloquea el login y la invitación sigue viva para
        // cuando amplíen el plan. `invalid`/`email_taken` aquí sólo pueden
        // ser una carrera (la revocaron o se registró entre medias): también
        // se bloquea, y el siguiente intento ya no encontrará invitación viva
        // y seguirá el alta normal.
        console.warn(
            `OAuth sign-in blocked: invitation for ${email} not accepted (${result.reason})`,
        )
        return null
    }

    // 4. First sign-in without invitation → create user + own org + owner
    //    membership so getOrgContext() resolves immediately.
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
