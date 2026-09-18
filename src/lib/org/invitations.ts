import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { INVITATION_TTL_HOURS } from './invitationRules'

/**
 * Tokens de invitación a una organización: generación, hasheo y comparación.
 *
 * SÓLO SERVIDOR: importa `node:crypto`. Las reglas puras (estado, caducidad,
 * email, enlace) viven en `invitationRules.ts`, que sí es seguro desde
 * cliente, y se re-exportan aquí para que los llamadores de servidor sigan
 * importando de un solo sitio. Un componente cliente NO debe importar de este
 * fichero: arrastra `node:crypto` al bundle y webpack falla ("Reading from
 * node:crypto is not handled by plugins") — pasó con la pantalla de miembros.
 *
 * Calcado de `src/lib/auth/resetToken.ts`, y DUPLICADO a propósito en vez de
 * importado: allí el TTL, la tabla y toda la documentación hablan de
 * recuperación de contraseña, y ese módulo es de los que no conviene retocar
 * por un motivo ajeno. Si aparece un TERCER tipo de token, entonces se extrae
 * `src/lib/auth/opaqueToken.ts` y los dos pasan a usarlo. El razonamiento de
 * por qué SHA-256 y no scrypt (256 bits de entropía, hash determinista para
 * ir al índice) vive en la cabecera de resetToken.ts y aplica igual aquí.
 *
 * `now` se inyecta para que los tests fijen el reloj.
 */

export {
    INVITATION_TTL_HOURS,
    invitationStatus,
    isInvitationLive,
    normalizeInviteEmail,
    buildInviteUrl,
    type InvitationStatus,
    type InvitationState,
} from './invitationRules'

const TOKEN_BYTES = 32

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
