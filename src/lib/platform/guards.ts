/**
 * EL GUARD DE PLATAFORMA — el candado que faltaba.
 *
 * `users.is_platform_admin` existía en la base desde julio y se leía en
 * `validateCredential.ts`, pero NO AUTORIZABA NADA: cero comprobaciones, cero
 * UI. Una bandera izada sin nada colgado de ella.
 *
 * Se evalúa ANTES del orden canónico de la organización
 * (`requirePermission → requireModule → assertOwnedAvatar`), porque es una
 * pregunta de otro eje: aquélla dice "qué puede hacer este miembro DENTRO de
 * su organización"; ésta dice "esta persona opera el sistema".
 *
 * Es ASÍNCRONO, al revés que `requirePermission`, y no hay forma de evitarlo:
 * el rol de organización ya viaja en el ctx, pero el privilegio de plataforma
 * se relee de la base a propósito (ver `isPlatformAdmin`).
 */
import { auth } from '@/auth'
import { isPlatformAdmin } from './platformDb'

export interface PlatformContext {
    userId: string
}

export class PlatformAccessDeniedError extends Error {
    readonly code = 'PLATFORM_ACCESS_DENIED'
    constructor() {
        super('Esta sección es del administrador de la plataforma.')
        this.name = 'PlatformAccessDeniedError'
    }
}

/** Lanza si quien llama no es admin de plataforma. Para server actions. */
export async function requirePlatformAdmin(): Promise<PlatformContext> {
    const ctx = await tryPlatformContext()
    if (!ctx) throw new PlatformAccessDeniedError()
    return ctx
}

/**
 * Variante tolerante: `null` en vez de lanzar.
 *
 * Para pintar (esconder el acceso a `/platform` en el menú) y para los layouts
 * que redirigen. Esconder NO es autorizar: cada acción de plataforma llama a
 * `requirePlatformAdmin` por su cuenta.
 */
export async function tryPlatformContext(): Promise<PlatformContext | null> {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return null
    if (!(await isPlatformAdmin(userId))) return null
    return { userId }
}

/** ¿Es este error un rechazo legítimo y no una avería? Como `isExpectedDenial`. */
export function isPlatformDenial(e: unknown): boolean {
    return (
        e instanceof Error &&
        (e as Error & { code?: string }).code === 'PLATFORM_ACCESS_DENIED'
    )
}
