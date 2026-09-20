/**
 * Tenant resolution (Phase 0 of the multitenant roadmap).
 *
 * Pattern ported from agentsoft's getAuthContext/getOrgContext, adapted to
 * NextAuth: session.user.id → organization_members → organizationId. Data
 * access stays on the service-role client with MANUAL
 * `.eq('organization_id', ...)` scoping (RLS-without-policies is only an
 * anti-anon backstop in this repo).
 *
 * Every NEW service (agent module onward) opens with `await getOrgContext()`
 * and writes/filters `organization_id`. Existing single-user services migrate
 * in the multitenant phase.
 *
 * F4.2 Tarea 4 — ESTE FICHERO NO PASA POR `orgTable`, y no es un olvido: es el
 * BOOTSTRAP del tenant. Tiene que leer `organization_members` para poder
 * CONSTRUIR el `ctx` que `orgTable` exige como primer argumento; hacerlo pasar
 * por ahí sería una dependencia circular (orgTable necesita el ctx que sólo
 * esta función sabe producir). Por eso se queda con el cliente service-role
 * crudo y por eso la regla de ESLint que prohíbe importar `agentSupabase`
 * exceptúa esta ruta explícitamente. La consulta ya está acotada por lo único
 * que puede acotarla aquí: el `user_id` de la sesión.
 */
import { cookies } from 'next/headers'
import { auth } from '@/auth'
import { agentSupabase, type OrgMemberRole } from '@/lib/agent/db'
import { isPlatformAdmin, latestGrantFor } from '@/lib/platform/platformDb'
import {
    resolveImpersonation,
    type SupportGrantKind,
} from '@/lib/platform/supportGrant'

/**
 * La cookie del «ver como» (F4.4). Sólo dice A QUÉ organización se quiere
 * entrar: NO otorga nada. Quién puede usarla y con qué rol lo decide
 * `resolveImpersonation` releyendo `is_platform_admin` y la concesión, así que
 * una cookie falsificada por un usuario normal no abre ninguna puerta.
 */
export const ORG_OVERRIDE_COOKIE = 'org_override'

export interface OrgContext {
    userId: string
    organizationId: string
    role: OrgMemberRole
    /**
     * ¿Un admin de plataforma está mirando este tenant sin ser miembro?
     *
     * Opcional a propósito: su ausencia significa "no", que es el valor seguro.
     * `userId` sigue siendo SIEMPRE la persona real de la sesión — lo único que
     * cambia al suplantar es la organización y el rol, así que lo que se
     * escriba como "creado por" nombra al actor de verdad y la bitácora no
     * puede mentir.
     */
    isImpersonating?: boolean
    /** De dónde salió la elevación, cuando la hay. Para el banner y la bitácora. */
    grantKind?: SupportGrantKind | null
}

/** Resolve the current session's org membership. Throws if unauthenticated or memberless. */
export async function getOrgContext(): Promise<OrgContext> {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) throw new Error('Not authenticated')
    const ctx = await resolveForSession(userId)
    if (!ctx) throw new Error('No organization membership for this user')
    return ctx
}

/**
 * El contexto de una sesión, mirando primero si hay «ver como» en curso.
 *
 * AQUÍ ESTÁ TODO EL SUPERADMIN. Como las ~69 rutas que tocan datos de tenant
 * pasan por esta función y de ahí van a `orgTable`, que pega el
 * `.eq('organization_id', …)`, cambiar la organización en este único punto
 * reorienta el producto entero —estudio, inbox, galería, monedero— sin tocar
 * una línea más. Es la recompensa de haber elegido en la F4.2 filtro manual
 * con service-role en vez de RLS: el tenant es un PARÁMETRO de aplicación, no
 * una identidad de base de datos.
 *
 * Si el override no se puede honrar (no es admin, o la organización no existe)
 * se IGNORA en silencio y la sesión sigue en su propia organización. No se
 * lanza: una cookie rancia no debe dejar a nadie fuera de su propia cuenta.
 */
async function resolveForSession(userId: string): Promise<OrgContext | null> {
    const target = await readOverrideTarget()
    if (target) {
        const impersonated = await impersonatedContext(userId, target)
        if (impersonated) return impersonated
    }
    return getOrgContextForUser(userId)
}

async function readOverrideTarget(): Promise<string | null> {
    try {
        const store = await cookies()
        return store.get(ORG_OVERRIDE_COOKIE)?.value ?? null
    } catch {
        // Fuera de una petición (cron, webhook, scripts) no hay cookies. No es
        // una anomalía: ahí simplemente no existe el «ver como».
        return null
    }
}

async function impersonatedContext(
    userId: string,
    organizationId: string,
): Promise<OrgContext | null> {
    const admin = await isPlatformAdmin(userId)
    if (!admin) return null
    const decision = resolveImpersonation({
        isPlatformAdmin: admin,
        targetOrganizationId: organizationId,
        grant: await latestGrantFor(organizationId),
        now: new Date(),
    })
    if (!decision.allowed) return null
    return {
        userId,
        organizationId,
        role: decision.role,
        isImpersonating: true,
        grantKind: decision.kind,
    }
}

/**
 * Variante TOLERANTE: devuelve null en vez de lanzar cuando no hay sesión o
 * membresía.
 *
 * Existe SOLO para decidir el prefijo de Storage (F4.2.c) en rutas de persist
 * que aún no reciben `ctx` propagado. La regla de riesgo: un objeto que cae en
 * la carpeta legacy es recuperable; una excepción a mitad de un persist pierde
 * una generación YA PAGADA al proveedor. Por eso aquí no se lanza.
 *
 * ⚠️ NO usar para autorizar nada. Autorizar con "si no hay contexto, seguimos"
 * es exactamente el bug que evita `getOrgContext()`. Cuando F5.0 propague ctx
 * por las entradas pagadas, esta función y su fallback desaparecen.
 */
export async function tryGetOrgContext(): Promise<OrgContext | null> {
    try {
        const session = await auth()
        const userId = session?.user?.id
        // Sin sesión es NORMAL: el layout raíz también pinta el login y las
        // páginas públicas. No se loguea para no ahogar la señal.
        if (!userId) return null

        const ctx = await resolveForSession(userId)
        if (!ctx) {
            // Sesión válida SIN membresía sí es una anomalía. El usuario ve la
            // aplicación pero se queda sin organización, y todo lo que cuelga
            // de ella se degrada en silencio a "no tienes nada": el menú, por
            // ejemplo, esconde los módulos instalados como si no existieran.
            // Sin esta línea eso era indiagnosticable desde fuera.
            console.error('[tenant] sesión sin membresía de organización', { userId })
        }
        return ctx
    } catch (e) {
        // El `catch` mudo original convertía cualquier fallo real de base de
        // datos en "este usuario no tiene organización", que es una conclusión
        // distinta y mucho más destructiva que la causa.
        console.error('[tenant] tryGetOrgContext:', e)
        return null
    }
}

/**
 * Session-less variant for webhooks/cron, where the user is resolved from
 * data (e.g. a connection row) instead of cookies.
 */
export async function getOrgContextForUser(userId: string): Promise<OrgContext | null> {
    const supabase = agentSupabase()
    const { data, error } = await supabase
        .from('organization_members')
        .select('organization_id, role')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null
    return { userId, organizationId: data.organization_id, role: data.role }
}
