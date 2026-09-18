'use server'

/**
 * Miembros e invitaciones de la organización: listar, invitar, regenerar el
 * enlace, revocar, cambiar rol y expulsar.
 *
 * Reparte el trabajo entre `src/lib/org/memberRules.ts` y `seats.ts` (las
 * reglas, puras y con tests) y `src/lib/org/membersDb.ts` (la base). Aquí
 * sólo se ordena: contexto → permiso → regla → escritura.
 *
 * EL TOKEN EN CLARO sale SÓLO de `inviteMember` y `reissueInvitationLink`, en
 * el momento de crearlo, y nunca de `listTeam`: no se guarda (sólo su hash) y
 * no se loguea. Quien cierre el diálogo sin copiarlo pulsa "Generar enlace
 * nuevo", que rota el token sobre la misma fila.
 *
 * `inviteMember` NO va en transacción: comprueba asientos y luego inserta, así
 * que dos propietarios invitando a la vez podrían meter una invitación de más.
 * Es aceptable PORQUE el punto de aplicación del tope es la función SQL
 * `accept_organization_invitation`, que cuenta bajo `for update` sobre la
 * organización: el que sobra recibe `no_seats` al aceptar y su invitación
 * sigue viva para cuando amplíen el plan. Lo de aquí es lo que apaga el botón
 * y explica por qué. No lo "arregles" moviendo la comprobación: no es la que
 * manda.
 *
 * Todos los exports son async porque el fichero es `'use server'`.
 */
import { revalidatePath } from 'next/cache'
import { getOrgContext } from '@/lib/tenant/getOrgContext'
import { ctxCan, isExpectedDenial, requirePermission } from '@/lib/org/guards'
import { orgTable } from '@/lib/org/orgTable'
import { isOrgRole, type OrgRole } from '@/lib/org/permissions'
import {
    INVITABLE_ROLES,
    decideRemoval,
    decideRoleChange,
} from '@/lib/org/memberRules'
import { canInviteMore, type SeatUsage } from '@/lib/org/seats'
import {
    generateInvitationToken,
    invitationStatus,
    normalizeInviteEmail,
    type InvitationStatus,
} from '@/lib/org/invitations'
import {
    deleteMember,
    findUserByEmail,
    insertInvitation,
    listOrgMembers,
    loadSeatUsage,
    setMemberRole,
    type OrgMemberRow,
} from '@/lib/org/membersDb'

export interface MembersResult<T> {
    success: boolean
    data?: T
    error?: string
}

export interface InvitationListItem {
    id: string
    email: string
    role: OrgRole
    status: InvitationStatus
    expiresAt: string
    createdAt: string
    linkIssuedCount: number
    lastIssuedAt: string
}

export interface TeamOverview {
    viewerUserId: string
    viewerRole: OrgRole
    /** Verdad de servidor: la pantalla apaga botones con esto, y cada acción lo re-comprueba. */
    canManage: boolean
    members: OrgMemberRow[]
    /** Pendientes y caducadas. Las aceptadas ya son miembros; las revocadas no aportan. */
    invitations: InvitationListItem[]
    seats: SeatUsage
}

/** Lo que devuelve crear o regenerar: el ÚNICO momento en que el token viaja en claro. */
export interface IssuedInvitation {
    invitationId: string
    email: string
    role: OrgRole
    token: string
    expiresAt: string
}

const PAGE = '/concepts/account/roles-permissions'

/** Rechazo legítimo: respuesta normal, sin ensuciar el log. */
function fail(message: string): MembersResult<never> {
    return { success: false, error: message }
}

/**
 * Para excepciones. Las de permisos son rechazos legítimos y salen por
 * `fail` sin registrarse; el resto se deja escrito (misma doctrina que
 * ModulesService).
 */
function failFromError(where: string, e: unknown): MembersResult<never> {
    if (!isExpectedDenial(e)) console.error(`[members] ${where}:`, e)
    return fail(e instanceof Error ? e.message : String(e))
}

const INVITATION_COLUMNS =
    'id, email, role, expires_at, accepted_at, revoked_at, created_at, link_issued_count, last_issued_at'

interface InvitationRow {
    id: string
    email: string
    role: OrgRole
    expires_at: string
    accepted_at: string | null
    revoked_at: string | null
    created_at: string
    link_issued_count: number
    last_issued_at: string
}

export async function listTeam(): Promise<MembersResult<TeamOverview>> {
    try {
        const ctx = await getOrgContext()
        // Cualquier miembro puede ver quién está en su organización; lo que
        // exige `members:manage` es cambiarlo.
        requirePermission(ctx, 'content:read')

        const [members, invitationsRes, seats] = await Promise.all([
            listOrgMembers(ctx),
            orgTable(ctx, 'organization_invitations')
                .select(INVITATION_COLUMNS)
                .is('accepted_at', null)
                .is('revoked_at', null)
                .order('created_at', { ascending: false }),
            loadSeatUsage(ctx),
        ])
        if (invitationsRes.error) throw new Error(invitationsRes.error.message)

        const now = new Date()
        const invitations: InvitationListItem[] = (
            (invitationsRes.data ?? []) as InvitationRow[]
        ).map((r) => ({
            id: r.id,
            email: r.email,
            role: r.role,
            status: invitationStatus(
                {
                    expiresAt: r.expires_at,
                    acceptedAt: r.accepted_at,
                    revokedAt: r.revoked_at,
                },
                now,
            ),
            expiresAt: r.expires_at,
            createdAt: r.created_at,
            linkIssuedCount: r.link_issued_count,
            lastIssuedAt: r.last_issued_at,
        }))

        return {
            success: true,
            data: {
                viewerUserId: ctx.userId,
                viewerRole: ctx.role as OrgRole,
                canManage: ctxCan(ctx, 'members:manage'),
                members,
                invitations,
                seats,
            },
        }
    } catch (e) {
        return failFromError('listTeam', e)
    }
}

export async function inviteMember(input: {
    email: string
    role: string
}): Promise<MembersResult<IssuedInvitation>> {
    try {
        const ctx = await getOrgContext()
        requirePermission(ctx, 'members:manage')

        const email = normalizeInviteEmail(input.email ?? '')
        if (!email) return fail('Introduce una dirección de correo válida.')

        if (!isOrgRole(input.role) || !INVITABLE_ROLES.includes(input.role)) {
            return fail(
                'Ese rol no se puede invitar. La propiedad se transfiere subiendo a un miembro, no por enlace.',
            )
        }
        const role = input.role

        // ¿Ya tiene cuenta? Decisión de producto: se rechaza. Un usuario vive
        // en UNA organización, y esta persona ya tiene la suya. Si además es
        // miembro de ESTA, el mensaje útil es otro.
        const existing = await findUserByEmail(email)
        if (existing) {
            const members = await listOrgMembers(ctx)
            if (members.some((m) => m.userId === existing.id)) {
                return fail('Esa persona ya es miembro de esta organización.')
            }
            return fail(
                'Ese email ya tiene una cuenta en la plataforma. Usa otro email para invitar a esta persona.',
            )
        }

        // ¿Ya hay una invitación viva (o caducada) para ese email? El índice
        // único parcial rechazaría la segunda fila con un error crudo de
        // Postgres; aquí se reconduce a lo que el usuario quiere decir.
        const { data: prior, error: priorError } = await orgTable(
            ctx,
            'organization_invitations',
        )
            .select('id, expires_at')
            .eq('email', email)
            .is('accepted_at', null)
            .is('revoked_at', null)
            .maybeSingle()
        if (priorError) throw new Error(priorError.message)
        if (prior) {
            const caducada = new Date(prior.expires_at).getTime() <= Date.now()
            return fail(
                caducada
                    ? 'Hay una invitación caducada para ese email. Usa «Generar enlace nuevo» para reactivarla.'
                    : 'Ya hay una invitación pendiente para ese email. Usa «Generar enlace nuevo» para volver a copiar su enlace.',
            )
        }

        const seats = await loadSeatUsage(ctx)
        const room = canInviteMore(seats)
        if (!room.ok) return fail(room.reason)

        const generated = generateInvitationToken()
        const { id } = await insertInvitation(ctx, {
            email,
            role,
            tokenHash: generated.tokenHash,
            expiresAt: generated.expiresAt,
        })

        // FUTURO (email): aquí, y sólo aquí. Cuando `src/lib/email/send.ts`
        // tenga proveedor: `if (isEmailConfigured()) await sendEmail({...})`.
        // El token en claro ya está en la mano en este punto. El enlace
        // copiable NO se retira cuando llegue el correo: es el respaldo cuando
        // el correo no llega (spam, buzón corporativo).

        revalidatePath(PAGE)
        // El token viaja en claro SÓLO en esta respuesta. No se loguea.
        return {
            success: true,
            data: {
                invitationId: id,
                email,
                role,
                token: generated.token,
                expiresAt: generated.expiresAt.toISOString(),
            },
        }
    } catch (e) {
        return failFromError('inviteMember', e)
    }
}

export async function reissueInvitationLink(
    invitationId: string,
): Promise<MembersResult<IssuedInvitation>> {
    try {
        const ctx = await getOrgContext()
        requirePermission(ctx, 'members:manage')
        if (!invitationId) return fail('Falta la invitación.')

        const { data: row, error } = await orgTable(
            ctx,
            'organization_invitations',
        )
            .select('id, email, role, expires_at, link_issued_count')
            .eq('id', invitationId)
            .is('accepted_at', null)
            .is('revoked_at', null)
            .maybeSingle()
        if (error) throw new Error(error.message)
        if (!row) return fail('Esa invitación ya no está pendiente.')

        // Una invitación caducada no ocupaba asiento; revivirla vuelve a
        // ocuparlo, así que se vuelve a comprobar el tope.
        if (new Date(row.expires_at).getTime() <= Date.now()) {
            const room = canInviteMore(await loadSeatUsage(ctx))
            if (!room.ok) return fail(room.reason)
        }

        const generated = generateInvitationToken()
        const { data: updated, error: updateError } = await orgTable(
            ctx,
            'organization_invitations',
        )
            .update({
                token_hash: generated.tokenHash,
                expires_at: generated.expiresAt.toISOString(),
                link_issued_count: row.link_issued_count + 1,
                last_issued_at: new Date().toISOString(),
            })
            .eq('id', invitationId)
            .is('accepted_at', null)
            .is('revoked_at', null)
            .select('id')
        if (updateError) throw new Error(updateError.message)
        if (!updated || updated.length === 0) {
            return fail('Esa invitación ya no está pendiente.')
        }

        revalidatePath(PAGE)
        return {
            success: true,
            data: {
                invitationId,
                email: row.email,
                role: row.role as OrgRole,
                token: generated.token,
                expiresAt: generated.expiresAt.toISOString(),
            },
        }
    } catch (e) {
        return failFromError('reissueInvitationLink', e)
    }
}

export async function revokeInvitation(
    invitationId: string,
): Promise<MembersResult<null>> {
    try {
        const ctx = await getOrgContext()
        requirePermission(ctx, 'members:manage')
        if (!invitationId) return fail('Falta la invitación.')

        // El predicado gana la carrera, igual que el quemado de reset-password:
        // cero filas = alguien la aceptó o la revocó antes.
        const { data, error } = await orgTable(ctx, 'organization_invitations')
            .update({
                revoked_at: new Date().toISOString(),
                revoked_by: ctx.userId,
            })
            .eq('id', invitationId)
            .is('accepted_at', null)
            .is('revoked_at', null)
            .select('id')
        if (error) throw new Error(error.message)
        if (!data || data.length === 0)
            return fail('Esa invitación ya no está pendiente.')

        revalidatePath(PAGE)
        return { success: true, data: null }
    } catch (e) {
        return failFromError('revokeInvitation', e)
    }
}

export async function changeMemberRole(
    userId: string,
    role: string,
): Promise<MembersResult<null>> {
    try {
        const ctx = await getOrgContext()
        requirePermission(ctx, 'members:manage')
        if (!userId) return fail('Falta el miembro.')

        const members = await listOrgMembers(ctx)
        const decision = decideRoleChange(
            members.map((m) => ({ userId: m.userId, role: m.role })),
            ctx.userId,
            userId,
            role,
        )
        if (!decision.ok) return fail(decision.reason)

        await setMemberRole(ctx, userId, role as OrgRole)
        revalidatePath(PAGE)
        return { success: true, data: null }
    } catch (e) {
        return failFromError('changeMemberRole', e)
    }
}

export async function removeMember(
    userId: string,
): Promise<MembersResult<null>> {
    try {
        const ctx = await getOrgContext()
        requirePermission(ctx, 'members:manage')
        if (!userId) return fail('Falta el miembro.')

        const members = await listOrgMembers(ctx)
        const decision = decideRemoval(
            members.map((m) => ({ userId: m.userId, role: m.role })),
            ctx.userId,
            userId,
        )
        if (!decision.ok) return fail(decision.reason)

        // Sus avatares y su contenido se quedan: son de la organización, y
        // `user_id` en las tablas tenant es sólo "creado por". No se reasignan
        // (falsificaría la auditoría y el ledger) y su cuenta en `users`
        // sobrevive.
        await deleteMember(ctx, userId)
        revalidatePath(PAGE)
        return { success: true, data: null }
    } catch (e) {
        return failFromError('removeMember', e)
    }
}
