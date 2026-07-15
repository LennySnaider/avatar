import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase'
import { hashPassword } from '@/lib/auth/password'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Real sign-up (P0 fix — this was a stub returning `{}`). Creates the
 * `users` row plus the user's own organization + owner membership so
 * `getOrgContext()` resolves on first sign-in.
 */
export async function POST(req: Request) {
    try {
        const body = (await req.json().catch(() => null)) as {
            userName?: string
            email?: string
            password?: string
        } | null

        const userName = body?.userName?.trim()
        const email = body?.email?.trim().toLowerCase()
        const password = body?.password

        if (!userName || !email || !password) {
            return NextResponse.json(
                { error: 'userName, email and password are required' },
                { status: 400 },
            )
        }
        if (!EMAIL_RE.test(email)) {
            return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
        }
        if (password.length < 8) {
            return NextResponse.json(
                { error: 'Password must be at least 8 characters' },
                { status: 400 },
            )
        }

        const supabase = createServerSupabaseClient() as unknown as SupabaseClient

        const emailPattern = email.replace(/[%_\\]/g, '\\$&')
        const { data: existing } = await supabase
            .from('users')
            .select('id')
            .ilike('email', emailPattern)
            .maybeSingle()
        if (existing) {
            return NextResponse.json(
                { error: 'An account with this email already exists' },
                { status: 409 },
            )
        }

        const userId = randomUUID()
        const { error: userErr } = await supabase.from('users').insert({
            id: userId,
            email,
            name: userName,
            password_hash: await hashPassword(password),
            provider: 'credentials',
            authority: ['user'],
        })
        if (userErr) throw new Error(userErr.message)

        // Own org + owner membership so getOrgContext() works on first sign-in.
        // slug is NOT NULL UNIQUE — derive from the name + random suffix.
        const slugBase = userName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 40) || 'org'
        const { data: org, error: orgErr } = await supabase
            .from('organizations')
            .insert({
                name: `${userName}'s Workspace`,
                slug: `${slugBase}-${randomUUID().slice(0, 8)}`,
            })
            .select('id')
            .single()
        if (orgErr) throw new Error(orgErr.message)
        const { error: memberErr } = await supabase
            .from('organization_members')
            .insert({
                organization_id: (org as { id: string }).id,
                user_id: userId,
                role: 'owner',
            })
        if (memberErr) throw new Error(memberErr.message)

        return NextResponse.json({
            status: 'success',
            message: 'Account created. You can sign in now.',
        })
    } catch (error) {
        console.error('Sign-up failed:', error)
        return NextResponse.json(
            { error: 'Sign-up failed. Please try again.' },
            { status: 500 },
        )
    }
}
