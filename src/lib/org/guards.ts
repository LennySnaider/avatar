/**
 * EL GUARD DE ROL — quien hace cumplir la matriz de `./permissions.ts`.
 *
 * Se usa en la PRIMERA línea tras `getOrgContext()`, antes de `requireModule` y
 * de `assertOwnedAvatar`:
 *
 *     const ctx = await getOrgContext()
 *     requirePermission(ctx, 'connection:manage')   // ← aquí
 *     await requireModule(ctx, 'telegram')
 *     await assertOwnedAvatar(ctx, avatarId)
 *
 * Ese orden no es estético: este guard es SÍNCRONO y sin I/O (el rol ya viaja
 * en el ctx), así que rechazar aquí ahorra las dos consultas de los otros dos
 * candados. Y se lee como lo que es: permiso → módulo → propiedad.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DOS FORMAS, Y CUÁNDO CADA UNA
 * ─────────────────────────────────────────────────────────────────────────
 *  - `requirePermission` LANZA. Es la de los servicios: están escritos con un
 *    `try/catch` que ya traduce excepciones al contrato `{success,error}`, y
 *    `requireModule`/`assertOwnedAvatar` ya establecieron ese precedente. Al
 *    lanzar, el guard puede vivir dentro de un helper compartido; un `return
 *    fail(...)` obligaría a tenerlo en la función que devuelve el resultado.
 *  - `ctxCan` DEVUELVE booleano. Es la de las rutas HTTP (que hablan códigos de
 *    estado: 403 con `{error}`) y la de los DTOs que la UI usa para apagar
 *    botones.
 *
 * IMPORTANTE — `OrgContext` entra como `import type` y no como valor. Si se
 * importara el valor, este módulo arrastraría `@/auth` y `agentSupabase`, y
 * dejaría de poder testearse con `tsx --test` (y cualquier import descuidado
 * desde cliente reventaría el bundle).
 */
import type { OrgContext } from '@/lib/tenant/getOrgContext'
import { can, type OrgRole, type Permission } from './permissions'

/** Cómo se llama cada rol de cara al usuario. */
export const ROLE_LABEL: Record<OrgRole, string> = {
    owner: 'Propietario',
    admin: 'Administrador',
    operator: 'Operador',
}

/**
 * Qué se estaba intentando hacer, en castellano y en infinitivo, para que el
 * mensaje de rechazo se decida UNA vez y no en los ~60 call sites.
 */
export const ACTION_LABEL: Record<Permission, string> = {
    'content:read': 'ver el contenido de la organización',
    'content:write': 'crear o editar contenido',
    'content:delete': 'borrar contenido',
    'generation:create': 'lanzar generaciones',
    'persona:write': 'editar la persona y el conocimiento del avatar',
    'inbox:reply': 'contestar en el inbox',
    'sale:send': 'enviar contenido de pago',
    'publish:social': 'publicar en redes',
    'avatar:delete': 'borrar un avatar',
    'voice:delete': 'borrar una voz clonada',
    'connection:manage': 'conectar o desconectar cuentas y bots',
    'pricing:manage': 'cambiar los precios del contenido de pago',
    'ai:autonomy': 'encender la IA autónoma',
    'module:manage': 'gestionar los módulos',
    'billing:manage': 'ver o gestionar la facturación',
    'members:manage': 'gestionar los miembros',
    'plan:manage': 'gestionar el plan de la organización',
}

/**
 * Error con mensaje presentable: los servicios lo devuelven tal cual en
 * `{ success: false, error }`. Mismo patrón que `ModuleNotInstalledError`
 * (`src/lib/modules/entitlements.ts`), y por el mismo motivo: un rechazo tiene
 * que poder explicarse al usuario sin que cada servicio redacte su propia frase.
 */
export class PermissionDeniedError extends Error {
    readonly code = 'PERMISSION_DENIED'
    constructor(
        readonly permission: Permission,
        readonly role: string,
    ) {
        super(
            `Tu rol (${ROLE_LABEL[role as OrgRole] ?? role}) no puede ${ACTION_LABEL[permission]}. Pídeselo a un administrador de tu organización.`,
        )
        this.name = 'PermissionDeniedError'
    }
}

/**
 * Lanza si el rol del contexto no tiene el permiso.
 *
 * Síncrono a propósito. Si algún permiso futuro necesitara una consulta (por
 * ejemplo "¿este avatar está asignado a este operador?"), NO va aquí: ese es
 * otro eje (`getAccessibleAvatarIds`) y mezclarlos convertiría todos los call
 * sites en `await`.
 */
export function requirePermission(
    ctx: OrgContext,
    permission: Permission,
): void {
    if (!can(ctx.role, permission)) {
        throw new PermissionDeniedError(permission, ctx.role)
    }
}

/** Forma booleana: para rutas HTTP y para los DTOs que la UI usa al pintar. */
export function ctxCan(ctx: OrgContext, permission: Permission): boolean {
    return can(ctx.role, permission)
}

/**
 * ¿Es este error un RECHAZO LEGÍTIMO en vez de una avería?
 *
 * Los servicios de familia `{success,error}` tienen un único `fail(where, e)`
 * que escribe `console.error` SIEMPRE, y se llama desde el `catch`. Sin esta
 * función, cada "no eres administrador" quedaría registrado como error del
 * servidor — y si todo se registra como error, nada destaca. Es la misma
 * doctrina que ya separa `fail` de `failFromError` en `ModulesService`, aplicada
 * a los servicios que sólo tienen la segunda.
 *
 * Cubre también `ModuleNotInstalledError`, que hoy sí se loguea como avería
 * siendo igual de legítimo.
 */
export function isExpectedDenial(e: unknown): boolean {
    if (e instanceof PermissionDeniedError) return true
    return (
        e instanceof Error &&
        (e as Error & { code?: string }).code === 'MODULE_NOT_INSTALLED'
    )
}
