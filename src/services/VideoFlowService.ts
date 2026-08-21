'use server'

/**
 * Server actions for the `video_flows` table. Replaces FlowToolbar's inline
 * anon browser client (P0: the anon key reached base tables without effective
 * RLS, and identity came from `supabase.auth.getUser()` — which is always
 * null under NextAuth, so save/load silently no-oped). Identity now comes
 * from the NextAuth session; every row access validates ownership.
 *
 * F4.2 Tarea 6 — MIGRADO A `orgTable`. Lo destapó el propio candado
 * (`npm run check:tenant`): este servicio se quedó fuera de las tareas 1-5 y
 * seguía acotando por `user_id`, que NO es frontera de tenant (es "creado
 * por", como documenta orgTable). Consecuencias reales del código anterior:
 *   - `assertFlowOwner` cargaba la fila SIN filtro de org y sólo comparaba
 *     `user_id`; una fila con `user_id` NULL (las hay: la columna venía del
 *     cliente anon) pasaba el chequeo desde CUALQUIER organización.
 *   - El INSERT no fijaba `organization_id` y caía al default de la columna
 *     (la org 1) — el agujero exacto que la Tarea 7 elimina con DROP DEFAULT,
 *     y que hasta entonces filtra en silencio.
 *
 * CAMBIO DE COMPORTAMIENTO DELIBERADO: el listado pasa de "mis flows" a "los
 * flows de mi organización", que es la semántica del resto de módulos ya
 * migrados (apiGetAvatars, generaciones, prompts). `user_id` se sigue
 * guardando como autoría.
 */
import { getOrgContext } from '@/lib/tenant/getOrgContext'
import { orgTable, orgInsert } from '@/lib/org/orgTable'
import type { OrgContext } from '@/lib/tenant/getOrgContext'
import type { Json } from '@/@types/database.generated'

export interface VideoFlowRow {
    id: string
    user_id: string
    name: string
    nodes: unknown[]
    edges: unknown[]
    updated_at: string
}

/** La fila existe DENTRO de la org de la sesión, o no existe para el llamante. */
async function assertFlowInOrg(ctx: OrgContext, flowId: string) {
    const { data, error } = await orgTable(ctx, 'video_flows')
        .select('id')
        .eq('id', flowId)
        .maybeSingle()
    if (error) throw error
    if (!data) throw new Error('Not your flow')
}

/** Create or update a flow. Returns the row id (new or existing). */
export async function apiSaveVideoFlow(
    flowId: string | null,
    name: string,
    nodes: unknown[],
    edges: unknown[],
): Promise<{ id: string }> {
    const ctx = await getOrgContext()
    const payload = {
        name,
        nodes: nodes as Json,
        edges: edges as Json,
        updated_at: new Date().toISOString(),
    }

    if (flowId) {
        await assertFlowInOrg(ctx, flowId)
        const { error } = await orgTable(ctx, 'video_flows')
            .update(payload)
            .eq('id', flowId)
        if (error) throw error
        return { id: flowId }
    }

    // `user_id` es autoría; la org la inyecta orgInsert desde el ctx.
    const { data, error } = await orgInsert(ctx, 'video_flows', {
        ...payload,
        user_id: ctx.userId,
    })
        .select('id')
        .single()
    if (error) throw error
    return { id: (data as { id: string }).id }
}

/** The org's most recent flows (for the Load menu). */
export async function apiListVideoFlows(): Promise<{ id: string; name: string }[]> {
    const ctx = await getOrgContext()
    const { data, error } = await orgTable(ctx, 'video_flows')
        .select('id, name')
        .order('updated_at', { ascending: false })
        .limit(20)
    if (error) throw error
    return (data as { id: string; name: string }[]) ?? []
}

export async function apiGetVideoFlow(flowId: string): Promise<VideoFlowRow> {
    const ctx = await getOrgContext()
    const { data, error } = await orgTable(ctx, 'video_flows')
        .select('*')
        .eq('id', flowId)
        .maybeSingle()
    if (error) throw error
    if (!data) throw new Error('Not your flow')
    return data as VideoFlowRow
}
