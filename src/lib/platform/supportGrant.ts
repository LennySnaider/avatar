/**
 * LA CONCESIÓN DE SOPORTE — quién deja entrar al admin de plataforma, y hasta
 * dónde.
 *
 * Modelo decidido con el usuario (F4.4). Tres situaciones, no dos:
 *
 *   | Situación               | Cómo entra            | Rol efectivo |
 *   |-------------------------|-----------------------|--------------|
 *   | Rutina / diagnóstico    | directo, auditado     | viewer       |
 *   | El tenant pide ayuda    | el tenant lo enciende | owner        |
 *   | El tenant no puede      | rompe el cristal      | owner        |
 *
 * LEER ES LIBRE Y ESCRIBIR SE CONCEDE. La privacidad del contenido se protege
 * con auditoría visible para el tenant, no con un muro: un muro bloquearía el
 * soporte y la moderación, y acabaría con el operador pidiendo la contraseña
 * por WhatsApp — que es perder la auditoría entera a cambio de nada.
 *
 * EL BREAK-GLASS EXISTE A PROPÓSITO. Si la única vía fuese la concesión del
 * cliente, un tenant que no puede entrar dejaría al soporte sin opciones justo
 * cuando más falta hace. Su defensa no es la dificultad, es la FRICCIÓN y el
 * rastro: motivo escrito obligatorio, caducidad corta, aviso al owner y marca
 * distinta en la bitácora. Por eso `kind` viaja hasta la decisión: quien pinta
 * el banner necesita distinguir "me abrieron la puerta" de "la forcé".
 *
 * Puro y sin I/O, como `lib/org/permissions.ts`: quien llama trae la fila de
 * `support_grants` ya leída. Eso lo hace testeable sin base de datos y seguro
 * de importar desde un componente cliente.
 */
import type { OrgMemberRole } from '@/lib/agent/db'

/** De dónde salió el permiso para operar. */
export type SupportGrantKind =
    /** El owner del tenant lo encendió desde su pantalla de cuenta. */
    | 'tenant'
    /** El admin de plataforma lo forzó con motivo, porque el tenant no podía. */
    | 'break_glass'

export interface SupportGrant {
    /** La concesión es POR ORGANIZACIÓN. Nunca un salvoconducto global. */
    organizationId: string
    kind: SupportGrantKind
    /** ISO. Caduca sola: nada de puertas olvidadas abiertas. */
    expiresAt: string
    /** ISO si el tenant la cortó antes de tiempo. */
    revokedAt: string | null
}

/**
 * Cuánto dura una concesión que enciende el tenant. Se ofrecen estas dos y no
 * un campo libre: la pregunta «¿cuántas horas?» no tiene buena respuesta para
 * quien sólo quiere que le ayuden, y un campo libre invita a poner un número
 * grande «por si acaso», que es justo la puerta olvidada que esto evita.
 */
export const TENANT_GRANT_HOURS = [24, 72] as const

/**
 * El break-glass dura UNA hora. Corto a propósito: se fuerza para resolver algo
 * concreto, no para trabajar dentro de la cuenta. Si hace falta más, el tenant
 * ya podrá conceder (que era el problema que lo justificaba).
 */
export const BREAK_GLASS_HOURS = 1

/** Cuándo caduca una concesión que empieza ahora. */
export function grantExpiry(now: Date, hours: number): Date {
    return new Date(now.getTime() + hours * 3600_000)
}

/** ¿Sigue en pie? Ni revocada ni vencida. */
export function isGrantLive(
    grant: SupportGrant | null | undefined,
    now: Date,
): boolean {
    if (!grant) return false
    if (grant.revokedAt) return false
    return new Date(grant.expiresAt).getTime() > now.getTime()
}

export interface ResolveImpersonationInput {
    /** `users.is_platform_admin`, releído de la base — no el hint de la sesión. */
    isPlatformAdmin: boolean
    /** La organización a la que se quiere entrar. */
    targetOrganizationId: string
    /** La concesión más reciente de ESA organización, si la hay. */
    grant: SupportGrant | null | undefined
    now: Date
}

export interface ImpersonationDecision {
    /** `false` = esta sesión no puede suplantar nada. Se ignora el override. */
    allowed: boolean
    /** El rol con el que se entra. Un rol REAL, de los que la matriz conoce. */
    role: OrgMemberRole
    /** ¿Puede escribir? Lo que decide si el banner va en rojo. */
    elevated: boolean
    /** De dónde salió la elevación, para la bitácora y el banner. */
    kind: SupportGrantKind | null
}

/**
 * Con qué rol entra un admin de plataforma a una organización ajena.
 *
 * Falla hacia MIRAR, nunca hacia cerrar: una concesión vencida o revocada
 * degrada a `viewer` en vez de expulsar a mitad de una revisión. Expulsar
 * dejaría al operador sin entender qué pasó; degradar es visible (el banner
 * cambia) y recuperable (el tenant vuelve a conceder).
 */
export function resolveImpersonation({
    isPlatformAdmin,
    targetOrganizationId,
    grant,
    now,
}: ResolveImpersonationInput): ImpersonationDecision {
    // Quien no es admin de plataforma no suplanta, tenga la cookie que tenga.
    // Ésta es la línea que hace inofensivo un `org_override` falsificado.
    if (!isPlatformAdmin) {
        return { allowed: false, role: 'viewer', elevated: false, kind: null }
    }

    // La concesión vale para SU organización y sólo para ésa. Sin esta
    // comprobación, un permiso que un tenant dio para su cuenta serviría para
    // escribir en la de cualquier otro.
    const aplica = grant?.organizationId === targetOrganizationId
    const viva = aplica && isGrantLive(grant, now)

    if (!viva) {
        return { allowed: true, role: 'viewer', elevated: false, kind: null }
    }
    return { allowed: true, role: 'owner', elevated: true, kind: grant!.kind }
}
