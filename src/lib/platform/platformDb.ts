/**
 * Acceso a datos del ADMIN DE PLATAFORMA — la mitad impura de la F4.4.
 *
 * Las reglas viven puras y con test en `./supportGrant.ts`; aquí sólo se lee y
 * se escribe. Misma separación que `lib/org/memberRules.ts` ↔ `membersDb.ts`.
 *
 * POR QUÉ `orgSupabase()` CRUDO Y NO `orgTable`:
 * ninguna de estas tablas es tenant en el sentido del builder.
 *  - `users` es la persona, que existe antes que cualquier organización.
 *  - `support_grants` es quien DECIDE la elevación: `getOrgContext()` la lee
 *    para poder construir el ctx que `orgTable` exige como primer argumento.
 *    Pasarla por el builder sería la misma dependencia circular que ya exime a
 *    `organization_members`.
 *  - `superadmin_audit_log` y la lista de organizaciones se leen A PROPÓSITO
 *    entre tenants: ése es el trabajo del panel de plataforma.
 * Por eso este fichero está exento del candado de `orgSupabase` en
 * `eslint.config.mjs`, con el motivo escrito allí.
 */
import { orgSupabase } from '@/lib/org/orgTable'
import type { SupportGrant, SupportGrantKind } from './supportGrant'

/**
 * ¿Es admin de plataforma? SE RELEE DE LA BASE, siempre.
 *
 * `is_platform_admin` viaja en la sesión pero sólo como hint de pintado. Misma
 * doctrina que hace que `getOrgContext()` relea `organization_members` en cada
 * petición: quitarle el privilegio a alguien tiene que surtir efecto YA, no
 * cuando caduque su cookie. Con un claim del JWT, un ex-administrador seguiría
 * siéndolo durante toda la vida de su sesión.
 */
export async function isPlatformAdmin(userId: string): Promise<boolean> {
    const { data, error } = await orgSupabase()
        .from('users')
        .select('is_platform_admin')
        .eq('id', userId)
        .maybeSingle()
    if (error) throw new Error(error.message)
    return data?.is_platform_admin === true
}

/**
 * La concesión más reciente de una organización, viva o no.
 *
 * Se devuelve aunque esté vencida o revocada: quien decide es
 * `resolveImpersonation`, que necesita verla para degradar a `viewer` en vez de
 * expulsar. Filtrar aquí por "viva" escondería el porqué de la degradación.
 */
export async function latestGrantFor(
    organizationId: string,
): Promise<SupportGrant | null> {
    const { data, error } = await orgSupabase()
        .from('support_grants')
        .select('organization_id, kind, expires_at, revoked_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null
    return {
        organizationId: data.organization_id,
        kind: data.kind as SupportGrantKind,
        expiresAt: data.expires_at,
        revokedAt: data.revoked_at,
    }
}

export interface AuditEntry {
    /** Quién DE VERDAD. Nunca el tenant suplantado. */
    actorUserId: string
    /** NULL en acciones de plataforma que no cuelgan de una organización. */
    organizationId?: string | null
    action: string
    elevated?: boolean
    grantKind?: SupportGrantKind | null
    reason?: string | null
    detail?: Record<string, unknown>
}

/**
 * Escribe en la bitácora.
 *
 * NO LANZA. Es deliberado y va contra la costumbre del resto del repo: esto se
 * llama desde acciones que ya hicieron su trabajo, y hacer fallar un "ver como"
 * porque el registro no entró no protege a nadie — deja al operador sin
 * entender qué pasó y sin el apunte igualmente. Se registra el fallo en el log
 * del servidor, que es donde alguien puede verlo.
 *
 * (La auditoría se escribe al ENTRAR a un tenant, no en cada petición:
 * `getOrgContext()` corre en las ~69 rutas y una fila por petición convertiría
 * la bitácora en un log de tráfico donde no se ve nada.)
 */
export async function writeAudit(entry: AuditEntry): Promise<void> {
    const { error } = await orgSupabase()
        .from('superadmin_audit_log')
        .insert({
            actor_user_id: entry.actorUserId,
            organization_id: entry.organizationId ?? null,
            action: entry.action,
            elevated: entry.elevated ?? false,
            grant_kind: entry.grantKind ?? null,
            reason: entry.reason ?? null,
            detail: (entry.detail ?? {}) as never,
        })
    if (error) {
        console.error('[platform] no se pudo escribir la bitácora:', error.message, entry)
    }
}

/** Una organización vista desde el panel de plataforma. */
export interface OrgOverview {
    id: string
    name: string
    slug: string | null
    planSlug: string | null
    subscriptionStatus: string | null
    billingExempt: boolean
    memberCount: number
    createdAt: string
}

/**
 * Todas las organizaciones, con cuántos miembros tiene cada una.
 *
 * SON DOS CONSULTAS por el mismo motivo que en `membersDb.listOrgMembers`:
 * PostgREST sólo embebe donde hay FK y el conteo agregado por organización se
 * resuelve más claro contando en memoria que peleando con la sintaxis de
 * agregados. El volumen aquí es de decenas de organizaciones, no de miles.
 */
export async function listOrganizations(): Promise<OrgOverview[]> {
    const db = orgSupabase()
    const { data: orgs, error } = await db
        .from('organizations')
        .select('id, name, slug, plan_slug, subscription_status, billing_exempt, created_at')
        .order('created_at', { ascending: true })
    if (error) throw new Error(error.message)

    const { data: members, error: mErr } = await db
        .from('organization_members')
        .select('organization_id')
    if (mErr) throw new Error(mErr.message)

    const conteo = new Map<string, number>()
    for (const m of members ?? []) {
        conteo.set(m.organization_id, (conteo.get(m.organization_id) ?? 0) + 1)
    }

    return (orgs ?? []).map((o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        planSlug: o.plan_slug,
        subscriptionStatus: o.subscription_status,
        billingExempt: o.billing_exempt === true,
        memberCount: conteo.get(o.id) ?? 0,
        createdAt: o.created_at,
    }))
}

/** Crea una concesión. El CHECK de la base exige motivo si es break-glass. */
export async function insertGrant(params: {
    organizationId: string
    kind: SupportGrantKind
    grantedBy: string
    reason: string | null
    expiresAt: Date
}): Promise<void> {
    const { error } = await orgSupabase()
        .from('support_grants')
        .insert({
            organization_id: params.organizationId,
            kind: params.kind,
            granted_by: params.grantedBy,
            reason: params.reason,
            expires_at: params.expiresAt.toISOString(),
        })
    if (error) throw new Error(error.message)
}

/**
 * Corta todas las concesiones vivas de una organización.
 *
 * Se revocan TODAS y no sólo la última: si alguna vez llegan a convivir dos
 * (una del tenant y un break-glass), «revocar» tiene que significar cerrar la
 * puerta, no cerrar una de las dos y dejar la otra abierta sin que se note.
 */
export async function revokeLiveGrants(
    organizationId: string,
    revokedBy: string,
): Promise<number> {
    const ahora = new Date().toISOString()
    const { data, error } = await orgSupabase()
        .from('support_grants')
        .update({ revoked_at: ahora, revoked_by: revokedBy })
        .eq('organization_id', organizationId)
        .is('revoked_at', null)
        .gt('expires_at', ahora)
        .select('id')
    if (error) throw new Error(error.message)
    return (data ?? []).length
}

export interface AuditRow {
    id: string
    actorUserId: string
    organizationId: string | null
    action: string
    elevated: boolean
    grantKind: SupportGrantKind | null
    reason: string | null
    createdAt: string
}

/**
 * La bitácora. Con `organizationId` es la vista del TENANT («¿quién ha entrado
 * en mi cuenta?»); sin él, la de plataforma.
 */
export async function listAudit(
    organizationId: string | null,
    limit = 100,
): Promise<AuditRow[]> {
    let q = orgSupabase()
        .from('superadmin_audit_log')
        .select('id, actor_user_id, organization_id, action, elevated, grant_kind, reason, created_at')
        .order('created_at', { ascending: false })
        .limit(limit)
    if (organizationId) q = q.eq('organization_id', organizationId)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    return (data ?? []).map((r) => ({
        id: r.id,
        actorUserId: r.actor_user_id,
        organizationId: r.organization_id,
        action: r.action,
        elevated: r.elevated,
        grantKind: r.grant_kind as SupportGrantKind | null,
        reason: r.reason,
        createdAt: r.created_at,
    }))
}

/** El nombre de una organización, para el banner del «ver como». */
export async function orgDisplayName(organizationId: string): Promise<string | null> {
    const { data, error } = await orgSupabase()
        .from('organizations')
        .select('name')
        .eq('id', organizationId)
        .maybeSingle()
    if (error) throw new Error(error.message)
    return data?.name ?? null
}
