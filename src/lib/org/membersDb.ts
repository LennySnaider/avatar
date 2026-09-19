/**
 * Acceso a datos de la membresía: miembros, invitaciones y asientos.
 *
 * Es la mitad IMPURA del equipo por organización. Las reglas viven en
 * `seats.ts` y `memberRules.ts` (puras, con tests); aquí sólo se lee y se
 * escribe, y `OrgMembersService` es quien junta las dos mitades.
 *
 * DOS CLIENTES, Y POR QUÉ:
 *  - `organization_invitations` ES tabla tenant (tiene organization_id NOT
 *    NULL, está en TENANT_TABLES): va por `orgTable`/`orgInsert`, con el
 *    filtro de organización pegado al builder.
 *  - `organization_members`, `organizations`, `plan_configurations` y `users`
 *    NO son tablas tenant: `organizations` es la identidad del tenant,
 *    `organization_members` es quien DEFINE la pertenencia (getOrgContext la
 *    lee para poder construir el ctx), `plan_configurations` es un catálogo
 *    global y `users` es la persona, que existe antes que cualquier
 *    organización. Van con `orgSupabase()` crudo filtrando a mano por el
 *    `organizationId` del ctx — mismo caso que `src/lib/billing/exemption.ts`,
 *    y por eso este fichero está exento del candado de `orgSupabase` en
 *    `eslint.config.mjs`, con el motivo escrito allí.
 *
 * EL FILTRO MÁS IMPORTANTE DE ESTE FICHERO es el `.eq('organization_id',
 * ctx.organizationId)` de `setMemberRole` y `deleteMember`: sin él, un id de
 * usuario de OTRO tenant sería expulsable desde aquí.
 */
import { orgInsert, orgSupabase, orgTable } from '@/lib/org/orgTable'
import type { OrgContext } from '@/lib/tenant/getOrgContext'
import { rememberPasswordChangedAt } from '@/lib/auth/passwordChangedAt'
import { computeSeatUsage, type SeatUsage } from './seats'
import type { OrgRole } from './permissions'

export interface OrgMemberRow {
    userId: string
    role: OrgRole
    joinedAt: string
    /** NULL si la fila de `users` ya no existe (no hay FK entre las dos tablas). */
    email: string | null
    name: string | null
    image: string | null
}

const ROLE_ORDER: Record<OrgRole, number> = { owner: 0, admin: 1, operator: 2 }

/**
 * Miembros de la organización con su perfil.
 *
 * SON DOS CONSULTAS, y no es descuido: `organization_members.user_id` no
 * tiene FK a `users`, así que PostgREST no puede embeber (`select('*,
 * users(*)')` falla en runtime con un error de relación, no en tsc). Orden:
 * propietarios, administradores, operadores; dentro de cada grupo, por
 * antigüedad.
 */
export async function listOrgMembers(ctx: OrgContext): Promise<OrgMemberRow[]> {
    const db = orgSupabase()
    const { data: rows, error } = await db
        .from('organization_members')
        .select('user_id, role, created_at')
        .eq('organization_id', ctx.organizationId)
    if (error) throw new Error(error.message)
    if (!rows || rows.length === 0) return []

    const ids = rows.map((r) => r.user_id)
    const { data: users, error: usersError } = await db
        .from('users')
        .select('id, email, name, image')
        .in('id', ids)
    if (usersError) throw new Error(usersError.message)
    const byId = new Map((users ?? []).map((u) => [u.id, u]))

    return rows
        .map((r) => {
            const u = byId.get(r.user_id)
            return {
                userId: r.user_id,
                role: r.role as OrgRole,
                joinedAt: r.created_at,
                email: u?.email ?? null,
                name: u?.name ?? null,
                image: u?.image ?? null,
            }
        })
        .sort(
            (a, b) =>
                ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
                a.joinedAt.localeCompare(b.joinedAt),
        )
}

export async function countOrgMembers(organizationId: string): Promise<number> {
    const { count, error } = await orgSupabase()
        .from('organization_members')
        .select('user_id', { head: true, count: 'exact' })
        .eq('organization_id', organizationId)
    if (error) throw new Error(error.message)
    return count ?? 0
}

/**
 * El NOMBRE de la organización, para enseñárselo a quien lo necesite.
 *
 * Vive aquí y no en quien lo pide (el prompt de sistema del Estratega es el
 * primero) porque `organizations` no es tabla tenant y leerla exige el cliente
 * crudo, que en el resto del repo está vetado por ESLint: este fichero ya es
 * la excepción documentada para esa tabla, así que el acceso queda en UN sitio
 * en vez de abrir una exención nueva por cada consumidor.
 *
 * Devuelve `null` si la organización no tiene nombre o no se pudo leer (sí se
 * loguea): un nombre es contexto, no una frontera, y quien lo pide debe tener
 * un texto de reserva.
 */
export async function readOrgName(
    organizationId: string,
): Promise<string | null> {
    const { data, error } = await orgSupabase()
        .from('organizations')
        .select('name')
        .eq('id', organizationId)
        .maybeSingle()
    if (error) {
        console.error('[org] no se pudo leer el nombre de la organización', {
            organizationId,
            error: error.message,
        })
        return null
    }
    return data?.name ?? null
}

/** El plan de la organización y su tope de asientos, tal como están en la base. */
export async function readOrgPlanSeats(organizationId: string): Promise<{
    planSlug: string | null
    maxSeats: number | null
    planFound: boolean
}> {
    const db = orgSupabase()
    const { data: org, error } = await db
        .from('organizations')
        .select('plan_slug')
        .eq('id', organizationId)
        .maybeSingle()
    if (error) throw new Error(error.message)
    if (!org?.plan_slug)
        return { planSlug: null, maxSeats: null, planFound: false }

    const { data: plan, error: planError } = await db
        .from('plan_configurations')
        .select('max_seats')
        .eq('slug', org.plan_slug)
        .maybeSingle()
    if (planError) throw new Error(planError.message)
    return {
        planSlug: org.plan_slug,
        maxSeats: plan?.max_seats ?? null,
        planFound: plan !== null,
    }
}

/** Invitaciones VIVAS: sin aceptar, sin revocar y sin caducar. Las que ocupan asiento. */
export async function countLiveInvitations(
    ctx: OrgContext,
    now: Date = new Date(),
): Promise<number> {
    const { count, error } = await orgTable(ctx, 'organization_invitations')
        .select('id', { head: true, count: 'exact' })
        .is('accepted_at', null)
        .is('revoked_at', null)
        .gt('expires_at', now.toISOString())
    if (error) throw new Error(error.message)
    return count ?? 0
}

/**
 * Compone el uso de asientos. Sin plan no se limita, pero se deja rastro: hoy
 * es el estado normal (no hay checkout), y el día que deje de serlo conviene
 * que el log diga qué organizaciones siguen sin plan.
 */
export async function loadSeatUsage(ctx: OrgContext): Promise<SeatUsage> {
    const [members, pendingInvitations, plan] = await Promise.all([
        countOrgMembers(ctx.organizationId),
        countLiveInvitations(ctx),
        readOrgPlanSeats(ctx.organizationId),
    ])
    const usage = computeSeatUsage({ members, pendingInvitations, ...plan })
    if (usage.planUnknown) {
        console.warn(
            '[org/seats] organización sin plan: los asientos no se limitan',
            {
                organizationId: ctx.organizationId,
                planSlug: plan.planSlug,
            },
        )
    }
    return usage
}

/**
 * ¿Ese email ya tiene cuenta? Búsqueda con `ilike` y el patrón escapado, igual
 * que sign-up: `%`, `_` y `\` en un email serían comodines.
 */
export async function findUserByEmail(
    email: string,
): Promise<{ id: string } | null> {
    const pattern = email.replace(/[%_\\]/g, '\\$&')
    const { data, error } = await orgSupabase()
        .from('users')
        .select('id')
        .ilike('email', pattern)
        .maybeSingle()
    if (error) throw new Error(error.message)
    return data ?? null
}

export interface NewInvitation {
    email: string
    role: OrgRole
    tokenHash: string
    expiresAt: Date
}

export async function insertInvitation(
    ctx: OrgContext,
    inv: NewInvitation,
): Promise<{ id: string }> {
    const { data, error } = await orgInsert(ctx, 'organization_invitations', {
        email: inv.email,
        role: inv.role,
        token_hash: inv.tokenHash,
        expires_at: inv.expiresAt.toISOString(),
        invited_by: ctx.userId,
    })
        .select('id')
        .single()
    if (error) throw new Error(error.message)
    return { id: data.id }
}

/**
 * Cambia el rol. El `.eq('organization_id')` lo pone `orgSupabase` a mano
 * porque `organization_members` no pasa por `orgTable`: es el filtro que
 * impide tocar la membresía de un usuario de otro tenant.
 */
export async function setMemberRole(
    ctx: OrgContext,
    userId: string,
    role: OrgRole,
): Promise<void> {
    const { data, error } = await orgSupabase()
        .from('organization_members')
        .update({ role })
        .eq('organization_id', ctx.organizationId)
        .eq('user_id', userId)
        .select('user_id')
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) {
        throw new Error('Ese miembro no existe en esta organización.')
    }
}

/** Expulsar es DELETE: ver la migración organization_invitations para el porqué. */
export async function deleteMember(
    ctx: OrgContext,
    userId: string,
): Promise<void> {
    const { data, error } = await orgSupabase()
        .from('organization_members')
        .delete()
        .eq('organization_id', ctx.organizationId)
        .eq('user_id', userId)
        .select('user_id')
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) {
        throw new Error('Ese miembro no existe en esta organización.')
    }
}

/**
 * Cierra las sesiones abiertas de un usuario expulsado.
 *
 * PRÉSTAMO SEMÁNTICO, y hay que saberlo: escribe `users.password_changed_at`
 * SIN cambiar la contraseña. Esa columna es, literalmente, "la marca de
 * invalidación de sesiones" del repo (ver reset-password/route.ts): el
 * callback `jwt` de src/auth.ts compara la marca con `sessionStartedAt` y
 * destruye la sesión y su cookie en ≤30 s (REVOCATION_CACHE_TTL_MS). Sin esto,
 * un expulsado seguiría paseando por la app hasta que su JWT caducara solo —
 * el middleware corre en edge y no puede mirar la base.
 *
 * DEUDA ANOTADA: si un tercer sitio necesita esto, la columna y el claim
 * deberían pasar a llamarse `sessions_valid_from`, porque ya no hablan sólo
 * de contraseñas.
 *
 * Sembrar la caché con `rememberPasswordChangedAt` hace la expulsión
 * inmediata en esta instancia; en las demás tarda la ventana de 30 s.
 */
export async function bumpSessionInvalidation(userId: string): Promise<void> {
    const now = new Date().toISOString()
    const { error } = await orgSupabase()
        .from('users')
        .update({ password_changed_at: now, updated_at: now })
        .eq('id', userId)
    if (error) throw new Error(error.message)
    rememberPasswordChangedAt(userId, now)
}
