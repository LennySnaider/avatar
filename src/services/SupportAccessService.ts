'use server'

/**
 * ACCESO DE SOPORTE, VISTO DESDE EL TENANT — conceder, revocar y ver quién ha
 * entrado.
 *
 * Es la otra mitad de la F4.4, y la que sostiene el argumento comercial: en un
 * producto con contenido privado, el cliente tiene que poder ver y cortar el
 * acceso del operador de la plataforma. Sin esta pantalla, la auditoría sería
 * una promesa nuestra en vez de algo que el cliente comprueba.
 *
 * Lo gobierna `members:manage` (hoy sólo `owner`): abrirle la puerta a alguien
 * de fuera es la misma clase de decisión que decidir quién está dentro.
 *
 * Todos los exports son async porque el fichero es `'use server'`.
 */
import { revalidatePath } from 'next/cache'
import { getOrgContext } from '@/lib/tenant/getOrgContext'
import { isExpectedDenial, requirePermission } from '@/lib/org/guards'
import {
    insertGrant,
    latestGrantFor,
    listAudit,
    revokeLiveGrants,
    writeAudit,
    type AuditRow,
} from '@/lib/platform/platformDb'
import {
    TENANT_GRANT_HOURS,
    grantExpiry,
    isGrantLive,
    type SupportGrantKind,
} from '@/lib/platform/supportGrant'

export interface SupportResult<T> {
    success: boolean
    data?: T
    error?: string
}

function fail(where: string, e: unknown): SupportResult<never> {
    if (!isExpectedDenial(e)) console.error(`[soporte] ${where}:`, e)
    return {
        success: false,
        error: e instanceof Error ? e.message : 'Error inesperado',
    }
}

export interface SupportAccessState {
    /** La concesión viva, si la hay. */
    active: { kind: SupportGrantKind; expiresAt: string; reason: string | null } | null
    /** Las horas que se pueden conceder. */
    options: readonly number[]
    /** Quién ha entrado en esta cuenta y cuándo. */
    history: AuditRow[]
}

export async function getSupportAccess(): Promise<SupportResult<SupportAccessState>> {
    try {
        const ctx = await getOrgContext()
        requirePermission(ctx, 'members:manage')
        const grant = await latestGrantFor(ctx.organizationId)
        const viva = isGrantLive(grant, new Date())
        return {
            success: true,
            data: {
                active: viva && grant
                    ? { kind: grant.kind, expiresAt: grant.expiresAt, reason: null }
                    : null,
                options: TENANT_GRANT_HOURS,
                history: await listAudit(ctx.organizationId, 50),
            },
        }
    } catch (e) {
        return fail('getSupportAccess', e)
    }
}

/**
 * Abrir la puerta: durante N horas, el soporte puede operar esta cuenta.
 *
 * SE RECHAZA SI QUIEN LLAMA ESTÁ SUPLANTANDO. Es el candado que cierra una
 * escalada real: un admin de plataforma que entra con break-glass (una hora)
 * queda con rol `owner` dentro del tenant, y sin esta línea podría abrir esta
 * misma pantalla y concederse 72 horas — convirtiendo un atajo corto y
 * auditado en acceso prolongado que parecería autorizado por el cliente. La
 * puerta sólo la abre un miembro de verdad.
 */
export async function grantSupportAccess(
    hours: number,
): Promise<SupportResult<{ expiresAt: string }>> {
    try {
        const ctx = await getOrgContext()
        requirePermission(ctx, 'members:manage')

        if (ctx.isImpersonating) {
            return {
                success: false,
                error: 'El acceso de soporte lo concede un miembro de la organización, no el soporte.',
            }
        }
        if (!TENANT_GRANT_HOURS.includes(hours as (typeof TENANT_GRANT_HOURS)[number])) {
            // Falla cerrado: esto llega del cliente y un número arbitrario
            // convertiría "caduca sola" en "caduca cuando alguien decida".
            return { success: false, error: 'Duración no válida.' }
        }

        const expiresAt = grantExpiry(new Date(), hours)
        await insertGrant({
            organizationId: ctx.organizationId,
            kind: 'tenant',
            grantedBy: ctx.userId,
            reason: null,
            expiresAt,
        })
        await writeAudit({
            actorUserId: ctx.userId,
            organizationId: ctx.organizationId,
            action: 'grant.tenant',
            elevated: true,
            grantKind: 'tenant',
            detail: { hours },
        })
        revalidatePath('/concepts/account/roles-permissions')
        return { success: true, data: { expiresAt: expiresAt.toISOString() } }
    } catch (e) {
        return fail('grantSupportAccess', e)
    }
}

/**
 * Cerrar la puerta antes de tiempo.
 *
 * Aquí NO se rechaza al suplantador: revocar sólo quita privilegio, y un
 * candado que impidiese cerrar la puerta no protegería a nadie.
 */
export async function revokeSupportAccess(): Promise<SupportResult<{ revoked: number }>> {
    try {
        const ctx = await getOrgContext()
        requirePermission(ctx, 'members:manage')
        const revoked = await revokeLiveGrants(ctx.organizationId, ctx.userId)
        await writeAudit({
            actorUserId: ctx.userId,
            organizationId: ctx.organizationId,
            action: 'grant.revoke',
            detail: { revoked },
        })
        revalidatePath('/concepts/account/roles-permissions')
        return { success: true, data: { revoked } }
    } catch (e) {
        return fail('revokeSupportAccess', e)
    }
}
