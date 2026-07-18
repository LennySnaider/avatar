/**
 * F4.2 — Query builder pre-scopeado por organización (patrón del super plan).
 *
 * Toda lectura/escritura de tablas TENANT pasa por aquí:
 *   const ctx = await getOrgContext()
 *   const { data } = await orgTable(ctx, 'avatars').select('*')
 *   await orgInsert(ctx, 'generations', { ...row })   // inyecta organization_id
 *
 * Reglas:
 * - Lecturas: `.eq('organization_id', ctx.organizationId)` SIEMPRE (la
 *   autorización real es este filtro manual con service-role; RLS-sin-políticas
 *   es solo backstop anti-anon).
 * - Escrituras: `orgInsert`/`orgUpsert` inyectan organization_id — nunca
 *   confiar en el default de la columna (es un puente de migración que se
 *   eliminará al cerrar F4.2).
 * - `user_id` en las tablas queda como "creado por" (auditoría), NO como
 *   frontera de tenant.
 */
import { createServerSupabaseClient } from '@/lib/supabase'
import type { OrgContext } from '@/lib/tenant/getOrgContext'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/@types/database.generated'

/** Tablas tenant (tienen organization_id NOT NULL). Mantener en sync con la
 *  migración multitenant_org_id_core. */
export const TENANT_TABLES = [
    'avatars',
    'avatar_references',
    'generations',
    'prompts',
    'cloned_voices',
    'audio_scripts',
    'video_flows',
    'social_profiles',
    'social_posts',
    'fanvue_connections',
    'fanvue_creators',
    'fanvue_posts',
    'avatar_personas',
    'avatar_knowledge',
    'agent_chats',
    'agent_messages',
    'avatar_fan_memories',
    'agent_usage_counters',
] as const

export type TenantTable = (typeof TENANT_TABLES)[number]

type Db = SupabaseClient<Database>

/** Cliente service-role tipado con el schema generado. */
export function orgSupabase(): Db {
    return createServerSupabaseClient() as unknown as Db
}

/**
 * SELECT/UPDATE/DELETE pre-scopeados: devuelve el builder ya filtrado por la
 * org del contexto. Para INSERT usar `orgInsert` (el filtro no aplica a
 * inserts).
 */
export function orgTable<T extends TenantTable>(ctx: OrgContext, table: T) {
    // Internamente el builder se maneja sin genéricos (supabase-js no resuelve
    // .eq sobre uniones de tablas); los tipos estrictos viven en los VALORES
    // (Insert/Update) y en el caller.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const from = () => orgSupabase().from(table) as any
    return {
        select: (columns = '*') =>
            from().select(columns).eq('organization_id', ctx.organizationId),
        update: (values: Database['public']['Tables'][T]['Update']) =>
            from().update(values).eq('organization_id', ctx.organizationId),
        delete: () => from().delete().eq('organization_id', ctx.organizationId),
    }
}

/** INSERT con organization_id inyectado. */
export function orgInsert<T extends TenantTable>(
    ctx: OrgContext,
    table: T,
    values:
        | Omit<Database['public']['Tables'][T]['Insert'], 'organization_id'>
        | Array<Omit<Database['public']['Tables'][T]['Insert'], 'organization_id'>>,
) {
    const supabase = orgSupabase()
    const rows = (Array.isArray(values) ? values : [values]).map((v) => ({
        ...v,
        organization_id: ctx.organizationId,
    }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return supabase.from(table).insert(rows as any)
}

/** UPSERT con organization_id inyectado. */
export function orgUpsert<T extends TenantTable>(
    ctx: OrgContext,
    table: T,
    values:
        | Omit<Database['public']['Tables'][T]['Insert'], 'organization_id'>
        | Array<Omit<Database['public']['Tables'][T]['Insert'], 'organization_id'>>,
    options?: { onConflict?: string },
) {
    const supabase = orgSupabase()
    const rows = (Array.isArray(values) ? values : [values]).map((v) => ({
        ...v,
        organization_id: ctx.organizationId,
    }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return supabase.from(table).upsert(rows as any, options)
}
