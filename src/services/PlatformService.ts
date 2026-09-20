'use server'

/**
 * EL PANEL DE PLATAFORMA — entrar a un tenant, romper el cristal y la bitácora.
 *
 * Reparte igual que el resto: las reglas puras y con test en
 * `src/lib/platform/supportGrant.ts`, la base en `platformDb.ts`, y aquí sólo
 * el orden: guard → regla → escritura → bitácora.
 *
 * TODAS las acciones abren con `requirePlatformAdmin()`, que relee
 * `is_platform_admin` de la base. Esconder el menú no autoriza nada.
 *
 * La bitácora se escribe AL ENTRAR, no en cada petición: `getOrgContext()`
 * corre en las ~69 rutas del producto y una fila por petición convertiría el
 * registro en un log de tráfico donde no se distingue nada.
 *
 * Todos los exports son async porque el fichero es `'use server'`.
 */
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { ORG_OVERRIDE_COOKIE } from '@/lib/tenant/getOrgContext'
import { requirePlatformAdmin, isPlatformDenial } from '@/lib/platform/guards'
import {
    insertGrant,
    latestGrantFor,
    listAudit,
    listOrganizations,
    writeAudit,
    type AuditRow,
    type OrgOverview,
} from '@/lib/platform/platformDb'
import {
    BREAK_GLASS_HOURS,
    grantExpiry,
    isGrantLive,
    resolveImpersonation,
} from '@/lib/platform/supportGrant'

export interface PlatformResult<T> {
    success: boolean
    data?: T
    error?: string
}

function fail(where: string, e: unknown): PlatformResult<never> {
    // Un "no eres admin de plataforma" es un rechazo legítimo, no una avería:
    // si se registrara como error del servidor, los errores de verdad se
    // perderían entre ellos. Misma doctrina que `isExpectedDenial`.
    if (!isPlatformDenial(e)) console.error(`[platform] ${where}:`, e)
    return {
        success: false,
        error: e instanceof Error ? e.message : 'Error inesperado',
    }
}

/** Las organizaciones del sistema, para la pantalla principal del panel. */
export async function listOrgs(): Promise<PlatformResult<OrgOverview[]>> {
    try {
        await requirePlatformAdmin()
        return { success: true, data: await listOrganizations() }
    } catch (e) {
        return fail('listOrgs', e)
    }
}

export interface ImpersonationState {
    organizationId: string
    elevated: boolean
    kind: 'tenant' | 'break_glass' | null
    expiresAt: string | null
}

/**
 * ¿Hay un «ver como» en curso? Lo pinta el banner.
 *
 * Recalcula la decisión en vez de fiarse de la cookie: si la concesión venció
 * mientras el operador tenía la pestaña abierta, el banner tiene que pasar de
 * "puedes escribir" a "sólo lectura" solo, sin recargar nada a mano.
 */
export async function currentImpersonation(): Promise<ImpersonationState | null> {
    try {
        const { userId } = await requirePlatformAdmin()
        void userId
        const store = await cookies()
        const organizationId = store.get(ORG_OVERRIDE_COOKIE)?.value
        if (!organizationId) return null
        const grant = await latestGrantFor(organizationId)
        const d = resolveImpersonation({
            isPlatformAdmin: true,
            targetOrganizationId: organizationId,
            grant,
            now: new Date(),
        })
        return {
            organizationId,
            elevated: d.elevated,
            kind: d.kind,
            expiresAt: d.elevated ? (grant?.expiresAt ?? null) : null,
        }
    } catch {
        // Sin sesión o sin privilegio no hay banner que pintar. No es anomalía.
        return null
    }
}

/** Entrar a ver un tenant. Sin concesión viva se entra en modo lectura. */
export async function enterOrg(
    organizationId: string,
): Promise<PlatformResult<{ elevated: boolean }>> {
    try {
        const { userId } = await requirePlatformAdmin()
        const grant = await latestGrantFor(organizationId)
        const elevated = isGrantLive(grant, new Date()) &&
            grant?.organizationId === organizationId

        const store = await cookies()
        store.set(ORG_OVERRIDE_COOKIE, organizationId, {
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
        })
        await writeAudit({
            actorUserId: userId,
            organizationId,
            action: 'impersonation.enter',
            elevated,
            grantKind: elevated ? (grant?.kind ?? null) : null,
        })
        revalidatePath('/', 'layout')
        return { success: true, data: { elevated } }
    } catch (e) {
        return fail('enterOrg', e)
    }
}

/** Salir del «ver como» y volver a la organización propia. */
export async function leaveOrg(): Promise<PlatformResult<{ left: boolean }>> {
    try {
        const { userId } = await requirePlatformAdmin()
        const store = await cookies()
        const organizationId = store.get(ORG_OVERRIDE_COOKIE)?.value ?? null
        store.delete(ORG_OVERRIDE_COOKIE)
        if (organizationId) {
            await writeAudit({
                actorUserId: userId,
                organizationId,
                action: 'impersonation.leave',
            })
        }
        revalidatePath('/', 'layout')
        return { success: true, data: { left: Boolean(organizationId) } }
    } catch (e) {
        return fail('leaveOrg', e)
    }
}

/**
 * ROMPER EL CRISTAL: elevarse sin que el tenant lo conceda.
 *
 * Para cuando el tenant no puede abrir la puerta — no puede entrar, perdió el
 * acceso, la cuenta está comprometida. El motivo es obligatorio y se guarda
 * tal cual: es lo que convierte un atajo en algo defendible ante una disputa.
 * Dura una hora (`BREAK_GLASS_HOURS`) porque se fuerza para resolver algo
 * concreto, no para trabajar dentro de la cuenta.
 */
export async function breakGlass(
    organizationId: string,
    reason: string,
): Promise<PlatformResult<{ expiresAt: string }>> {
    try {
        const { userId } = await requirePlatformAdmin()
        const motivo = reason.trim()
        if (motivo.length < 10) {
            // Un motivo de tres letras no es un motivo. El corte va aquí y no
            // sólo en el CHECK de la base para poder explicarlo.
            return {
                success: false,
                error: 'Escribe por qué hace falta entrar sin permiso del tenant (mínimo 10 caracteres).',
            }
        }
        const expiresAt = grantExpiry(new Date(), BREAK_GLASS_HOURS)
        await insertGrant({
            organizationId,
            kind: 'break_glass',
            grantedBy: userId,
            reason: motivo,
            expiresAt,
        })
        await writeAudit({
            actorUserId: userId,
            organizationId,
            action: 'grant.break_glass',
            elevated: true,
            grantKind: 'break_glass',
            reason: motivo,
        })
        revalidatePath('/', 'layout')
        return { success: true, data: { expiresAt: expiresAt.toISOString() } }
    } catch (e) {
        return fail('breakGlass', e)
    }
}

/** La bitácora completa, entre tenants. */
export async function platformAudit(): Promise<PlatformResult<AuditRow[]>> {
    try {
        await requirePlatformAdmin()
        return { success: true, data: await listAudit(null) }
    } catch (e) {
        return fail('platformAudit', e)
    }
}
