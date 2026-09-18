/**
 * Reglas de la membresía: quién puede cambiar roles y expulsar, y qué cambios
 * dejarían a la organización en un estado del que no se puede volver.
 *
 * PURAS: reciben la lista de miembros y devuelven una decisión con su motivo.
 * `OrgMembersService` las llama después de leer la base y antes de escribir;
 * los tests las ejercitan sin base.
 *
 * Las dos invariantes que importan, y por qué:
 *
 *  - NUNCA SIN PROPIETARIO. Una organización sin `owner` es una organización
 *    que nadie puede volver a gestionar: no se puede cambiar roles, ni
 *    invitar, ni recuperarla sin tocar la base a mano. La regla mira el ROL
 *    del objetivo, no quién pulsa, así que cubre de un golpe "degradar al
 *    único propietario" y "degradarme yo siendo el único".
 *
 *  - NO AUTOEXPULSARSE. Con el índice de una organización por usuario, quien
 *    se expulsa a sí mismo deja una cuenta viva sin ninguna organización: la
 *    app queda inservible para esa persona y NO hay camino de vuelta, porque
 *    su email ya está ocupado y no puede ni aceptar otra invitación.
 *
 * Transferir la propiedad sale gratis de estas reglas: se sube a otro a
 * `owner` (permitido) y luego uno se baja a `admin` (ahora hay dos
 * propietarios, la regla no salta). No hace falta una acción dedicada.
 */
import { ROLE_LABEL } from './guards'
import { can, isOrgRole, type OrgRole } from './permissions'

/** Qué hace cada rol, para la pantalla de miembros. */
export const ROLE_DESCRIPTION: Record<OrgRole, string> = {
    owner: 'Todo, incluidos los miembros, los roles y el plan.',
    admin: 'Todo el producto, la facturación y las conexiones. No gestiona miembros.',
    operator:
        'Opera y genera: avatares, generaciones, inbox, ventas y publicaciones. No toca facturación, conexiones ni precios.',
}

/**
 * Roles que se pueden INVITAR. `owner` no está: la propiedad se transfiere
 * subiendo a un miembro existente, no se regala por enlace.
 */
export const INVITABLE_ROLES: readonly OrgRole[] = ['operator', 'admin']

/**
 * ¿Puede este rol gestionar miembros? Hoy sólo `owner`. Abrirlo a `admin` es
 * añadir 'members:manage' al conjunto ADMIN de `permissions.ts` — una línea, y
 * el test de la matriz que la protege cambia a propósito.
 */
export function canManageMembers(role: string | null | undefined): boolean {
    return can(role, 'members:manage')
}

export interface MemberSummary {
    userId: string
    role: OrgRole
}

export type Decision = { ok: true } | { ok: false; reason: string }

const deny = (reason: string): Decision => ({ ok: false, reason })

export function countOwners(members: readonly MemberSummary[]): number {
    return members.filter((m) => m.role === 'owner').length
}

export function decideRoleChange(
    members: readonly MemberSummary[],
    actorUserId: string,
    targetUserId: string,
    nextRole: string,
): Decision {
    const actor = members.find((m) => m.userId === actorUserId)
    if (!actor) return deny('No perteneces a esta organización.')
    if (!canManageMembers(actor.role)) {
        return deny('Sólo el propietario puede cambiar los roles.')
    }

    const target = members.find((m) => m.userId === targetUserId)
    if (!target) return deny('Ese miembro no existe en esta organización.')

    if (!isOrgRole(nextRole)) return deny('Ese rol no existe.')

    // Rechazo explícito y no un no-op silencioso: el usuario ve por qué no
    // pasó nada.
    if (target.role === nextRole) {
        return deny(`Ese miembro ya es ${ROLE_LABEL[nextRole].toLowerCase()}.`)
    }

    if (
        target.role === 'owner' &&
        nextRole !== 'owner' &&
        countOwners(members) === 1
    ) {
        return deny(
            'La organización se quedaría sin propietario. Nombra antes a otro propietario.',
        )
    }

    return { ok: true }
}

export function decideRemoval(
    members: readonly MemberSummary[],
    actorUserId: string,
    targetUserId: string,
): Decision {
    const actor = members.find((m) => m.userId === actorUserId)
    if (!actor) return deny('No perteneces a esta organización.')
    if (!canManageMembers(actor.role)) {
        return deny('Sólo el propietario puede expulsar miembros.')
    }

    if (actorUserId === targetUserId) {
        return deny(
            'No puedes expulsarte a ti mismo. Transfiere la propiedad y pide que te den de baja.',
        )
    }

    const target = members.find((m) => m.userId === targetUserId)
    if (!target) return deny('Ese miembro no existe en esta organización.')

    if (target.role === 'owner' && countOwners(members) === 1) {
        return deny('La organización se quedaría sin propietario.')
    }

    return { ok: true }
}
