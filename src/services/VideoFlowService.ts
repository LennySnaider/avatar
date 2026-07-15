'use server'

/**
 * Server actions for the `video_flows` table. Replaces FlowToolbar's inline
 * anon browser client (P0: the anon key reached base tables without effective
 * RLS, and identity came from `supabase.auth.getUser()` — which is always
 * null under NextAuth, so save/load silently no-oped). Identity now comes
 * from the NextAuth session; every row access validates ownership.
 *
 * NOTE: `video_flows` is not in the generated Database types yet (known
 * drift, F4.0 fixes it) — hence the local row type + untyped client cast.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireUserId } from '@/lib/session'
import { createServerSupabaseClient } from '@/lib/supabase'

export interface VideoFlowRow {
    id: string
    user_id: string
    name: string
    nodes: unknown[]
    edges: unknown[]
    updated_at: string
}

const getDb = () => createServerSupabaseClient() as unknown as SupabaseClient

async function assertFlowOwner(db: SupabaseClient, flowId: string, userId: string) {
    const { data, error } = await db
        .from('video_flows')
        .select('id, user_id')
        .eq('id', flowId)
        .single()
    if (error) throw error
    if (data.user_id && data.user_id !== userId) throw new Error('Not your flow')
}

/** Create or update a flow. Returns the row id (new or existing). */
export async function apiSaveVideoFlow(
    flowId: string | null,
    name: string,
    nodes: unknown[],
    edges: unknown[],
): Promise<{ id: string }> {
    const userId = await requireUserId()
    const db = getDb()
    const payload = {
        user_id: userId,
        name,
        nodes,
        edges,
        updated_at: new Date().toISOString(),
    }

    if (flowId) {
        await assertFlowOwner(db, flowId, userId)
        const { error } = await db.from('video_flows').update(payload).eq('id', flowId)
        if (error) throw error
        return { id: flowId }
    }

    const { data, error } = await db
        .from('video_flows')
        .insert(payload)
        .select('id')
        .single()
    if (error) throw error
    return { id: (data as { id: string }).id }
}

/** The current user's most recent flows (for the Load menu). */
export async function apiListVideoFlows(): Promise<{ id: string; name: string }[]> {
    const userId = await requireUserId()
    const db = getDb()
    const { data, error } = await db
        .from('video_flows')
        .select('id, name')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(20)
    if (error) throw error
    return (data as { id: string; name: string }[]) ?? []
}

export async function apiGetVideoFlow(flowId: string): Promise<VideoFlowRow> {
    const userId = await requireUserId()
    const db = getDb()
    const { data, error } = await db
        .from('video_flows')
        .select('*')
        .eq('id', flowId)
        .single()
    if (error) throw error
    const row = data as VideoFlowRow
    if (row.user_id && row.user_id !== userId) throw new Error('Not your flow')
    return row
}
