import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Tokens de invitación a una organización: generación, hasheo, vigencia y el
 * enlace que se copia.
 *
 * Calcado de `src/lib/auth/resetToken.ts`, y DUPLICADO a propósito en vez de
 * importado: allí el TTL, la tabla y toda la documentación hablan de
 * recuperación de contraseña, y ese módulo es de los que no conviene retocar
 * por un motivo ajeno. Si aparece un TERCER tipo de token, entonces se extrae
 * `src/lib/auth/opaqueToken.ts` y los dos pasan a usarlo. El razonamiento de
 * por qué SHA-256 y no scrypt (256 bits de entropía, hash determinista para
 * ir al índice) vive en la cabecera de resetToken.ts y aplica igual aquí.
 *
 * Puro: sin base de datos y sin `Date.now()` escondido — `now` se inyecta para
 * que los tests fijen el reloj.
 */

const TOKEN_BYTES = 32

/**
 * CADUCIDAD: 7 días (frente a los 30 minutos del reset).
 *
 * Una invitación no llega por correo ni la pide el destinatario: la pega
 * alguien por WhatsApp o Slack y el invitado puede estar de vacaciones. Con 30
 * minutos, "invitar" sería "invitar y quedarse mirando". Sigue acotada, porque
 * una invitación abandonada es una llave viva y (mientras no caduca) un
 * asiento ocupado.
 */
export const INVITATION_TTL_HOURS = 168

export interface GeneratedInvitationToken {
    /** Secreto en claro. SÓLO va al enlace; nunca se guarda ni se loguea. */
    token: string
    /** Lo único que se persiste. */
    tokenHash: string
    expiresAt: Date
}

/** SHA-256 hex, determinista: es lo que permite buscar la fila por el hash. */
export function hashInvitationToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function generateInvitationToken(
    now: Date = new Date(),
): GeneratedInvitationToken {
    const token = randomBytes(TOKEN_BYTES).toString('base64url')
    return {
        token,
        tokenHash: hashInvitationToken(token),
        expiresAt: new Date(now.getTime() + INVITATION_TTL_HOURS * 3_600_000),
    }
}

/** Comparación en tiempo constante, por costumbre defensiva (ver resetToken.ts). */
export function invitationTokenHashEquals(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8')
    const bufB = Buffer.from(b, 'utf8')
    if (bufA.length !== bufB.length) return false
    return timingSafeEqual(bufA, bufB)
}

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
