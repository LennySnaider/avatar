'use server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SignInCredential } from '@/@types/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { verifyPassword } from '@/lib/auth/password'

/** Row shape of the `users` table (not yet in generated Database types). */
export interface DbUser {
    id: string
    email: string
    name: string | null
    image: string | null
    password_hash: string | null
    provider: string
    provider_account_id: string | null
    authority: string[]
    is_platform_admin: boolean
}

/**
 * Validate credentials against the `users` table (P0 fix — this used to
 * compare plaintext against src/mock/data/authData). Requires the
 * 20260715090000_users migration to be applied.
 */
const validateCredential = async (values: SignInCredential) => {
    const { email, password } = values
    if (!email || !password) return null

    const supabase = createServerSupabaseClient() as unknown as SupabaseClient
    // ilike = case-insensitive equality here; escape %/_ so they can't act
    // as pattern wildcards.
    const emailPattern = email.trim().replace(/[%_\\]/g, '\\$&')
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .ilike('email', emailPattern)
        .maybeSingle()
    if (error) {
        console.error('validateCredential lookup failed:', error.message)
        return null
    }

    const user = data as DbUser | null
    // OAuth-provisioned users have no password — they must use their provider.
    if (!user?.password_hash) return null
    if (!(await verifyPassword(password, user.password_hash))) return null

    return {
        id: user.id,
        userName: user.name ?? user.email,
        email: user.email,
        avatar: user.image ?? '',
        authority: user.authority ?? ['user'],
    }
}

export default validateCredential
