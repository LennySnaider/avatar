/**
 * Reglas PURAS de una invitación: estado, caducidad, email y el enlace.
 *
 * Separadas de `invitations.ts` por una razón concreta, no por gusto: ese
 * módulo importa `node:crypto` para generar y hashear el token, y un
 * componente cliente que importe CUALQUIER cosa de él arrastra `node:crypto`
 * al bundle del navegador — webpack falla con "Reading from node:crypto is not
 * handled by plugins". Fue exactamente lo que tumbó el primer despliegue de la
 * pantalla de miembros (`MembersClient` sólo quería `buildInviteUrl`).
 *
 * Este fichero NO importa nada de Node y es seguro desde cliente. Lo que
 * necesite crypto vive en `invitations.ts`, que re-exporta esto para los
 * llamadores de servidor.
 */

/**
 * CADUCIDAD: 7 días (frente a los 30 minutos del reset de contraseña).
 *
 * Una invitación no llega por correo ni la pide el destinatario: la pega
 * alguien por WhatsApp o Slack y el invitado puede estar de vacaciones. Con 30
 * minutos, "invitar" sería "invitar y quedarse mirando". Sigue acotada, porque
 * una invitación abandonada es una llave viva y (mientras no caduca) un
 * asiento ocupado.
 */
export const INVITATION_TTL_HOURS = 168

export type InvitationStatus = 'pending' | 'expired' | 'accepted' | 'revoked'

/** Lo que importa de una fila de `organization_invitations` para saber su estado. */
export interface InvitationState {
    expiresAt: Date | string
    acceptedAt: Date | string | null
    revokedAt: Date | string | null
}

function toTime(value: Date | string): number {
    return (value instanceof Date ? value : new Date(value)).getTime()
}

/**
 * El estado, con esta prioridad: revocada > aceptada > caducada > pendiente.
 *
 * El orden importa cuando se solapan: una invitación revocada que además
 * caducó es "revocada", que es lo que el propietario hizo; y una aceptada que
 * caducó después sigue siendo "aceptada", porque la persona ya entró. Una
 * caducidad ilegible se trata como caducada: lo que no se puede comprobar se
 * rechaza, igual que en `isResetTokenUsable`.
 */
export function invitationStatus(
    state: InvitationState,
    now: Date = new Date(),
): InvitationStatus {
    if (state.revokedAt !== null && state.revokedAt !== undefined)
        return 'revoked'
    if (state.acceptedAt !== null && state.acceptedAt !== undefined)
        return 'accepted'
    const expires = toTime(state.expiresAt)
    if (Number.isNaN(expires) || expires <= now.getTime()) return 'expired'
    return 'pending'
}

/** Viva = pendiente: sin aceptar, sin revocar y sin caducar. Es la que ocupa asiento. */
export function isInvitationLive(
    state: InvitationState,
    now: Date = new Date(),
): boolean {
    return invitationStatus(state, now) === 'pending'
}

/**
 * Deliberadamente laxa: comprueba la forma `algo@algo.algo` y nada más. Un
 * validador estricto de RFC 5322 rechaza direcciones reales, y aquí el coste
 * de equivocarse es bajo (el enlace lo entrega una persona a mano, no un
 * servidor de correo).
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Recorta, pasa a minúsculas y valida. `null` si no tiene forma de email. */
export function normalizeInviteEmail(raw: string): string | null {
    const email = raw.trim().toLowerCase()
    return EMAIL_RE.test(email) ? email : null
}

/**
 * El enlace que se copia. `origin` lo pone el CLIENTE con
 * `window.location.origin`, no el servidor con `NEXT_PUBLIC_APP_URL`: quien
 * copia el enlace es una persona con sesión en su navegador, así que el origen
 * correcto es el que está mirando — y así funciona igual en los previews de
 * Vercel, donde esa variable apunta a producción.
 *
 * Ruta ESTÁTICA con el token en query, no `/invite/[token]`: el middleware
 * casa las rutas públicas por igualdad exacta de pathname, y un segmento
 * dinámico no casaría nunca.
 */
export function buildInviteUrl(origin: string, token: string): string {
    return `${origin.replace(/\/+$/, '')}/accept-invite?token=${encodeURIComponent(token)}`
}
