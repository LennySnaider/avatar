/**
 * QUÉ PUEDE HACER CADA ROL DE LA ORGANIZACIÓN — la matriz, y el único sitio
 * donde vive la jerarquía.
 *
 * El enum `org_member_role` existe en la base desde julio
 * (`20260711090000_organizations.sql`) y `getOrgContext()` devuelve el rol en
 * cada petición, pero hasta ahora sólo UN sitio en todo `src/` lo miraba
 * (`ModulesService.canManage`). O sea: un `operator` podía borrar avatares,
 * conectar bots, gastar el wallet y vender. Este fichero es la respuesta a
 * "¿puede?", y `./guards.ts` es quien la hace cumplir.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ PERMISOS CON NOMBRE Y NO COMPARAR ROLES A PELO
 * ─────────────────────────────────────────────────────────────────────────
 * `ctx.role === 'owner' || ctx.role === 'admin'` repartido por 60 servicios es
 * una regla escrita 60 veces: cambiarla es un `grep` y rezar, y nadie puede
 * leer de un tirón qué puede hacer un operator. Con permisos, el reparto se lee
 * en una tabla y el call site dice lo que HACE (`connection:manage`), no quién
 * lo hace.
 *
 * POR QUÉ CONJUNTOS CON SPREAD Y NO UNA ESCALERA DE RANGOS
 * `RANK[role] >= RANK[minRole]` es más corto, pero asume que todo rol futuro es
 * monótono. El día que entre un rol no-monótono (un "finance" que toca
 * facturación pero no contenido), la escalera REINTERPRETA en silencio los 17
 * permisos. Con conjuntos, el spread ES la herencia y un rol nuevo es un array
 * más aquí: cero call sites tocados. `viewer` (F4.4) entró exactamente así —
 * `const VIEWER = ['content:read']` y `OPERATOR = [...VIEWER, …]`— sin tocar
 * ni uno de los ~121 `requirePermission` repartidos por los servicios.
 *
 * PURO A PROPÓSITO: ni un import de runtime (sólo `import type`). Eso es lo que
 * lo hace testeable con `node:test` sin base de datos y seguro de importar
 * desde un componente cliente — el hook `usePermission` lo usa.
 */
import type { OrgMemberRole } from '@/lib/agent/db'

/**
 * Los roles, de menos a más capaz. El orden es documentación: la herencia real
 * la hacen los spreads de abajo, no este array.
 */
export const ORG_ROLES = ['viewer', 'operator', 'admin', 'owner'] as const

/** Mismo conjunto que el enum SQL `org_member_role`, verificado por el `satisfies` final. */
export type OrgRole = (typeof ORG_ROLES)[number]

export const PERMISSIONS = [
    // — Operar: el trabajo diario de quien maneja los avatares —
    'content:read',
    'content:write',
    /**
     * Borrar generaciones, referencias, prompts e ítems de galería.
     *
     * VA CON `operator` Y NO CON `admin`, y no es un descuido: en este producto
     * borrar es parte de EDITAR. Descartar una generación recién entregada la
     * borra sola (AvatarStudioMain), y reemplazar la foto de cara de un avatar
     * borra la referencia anterior. Si esto fuese de admin, al operator le
     * fallaría el estudio a media faena y quedarían filas huérfanas que
     * "reviven" al recargar. Lo irreversible de verdad vive en `avatar:delete`
     * y `voice:delete`.
     */
    'content:delete',
    /** Lanzar generaciones. GASTA TOKENS del wallet de la organización. */
    'generation:create',
    'persona:write',
    'inbox:reply',
    /** Enviar contenido de pago y ofertas: cierra ventas con el precio ya fijado. */
    'sale:send',
    'publish:social',

    // — Administrar: dinero, conexiones y lo irreversible —
    /** Borrar el avatar completo con toda su media. */
    'avatar:delete',
    /** Borrar una voz clonada: rehacerla cuesta dinero de proveedor. */
    'voice:delete',
    /** Bots de Telegram, cuentas sociales, Fanvue, proveedores. */
    'connection:manage',
    /** Fijar el precio en Stars del contenido de pago. */
    'pricing:manage',
    /** Autopilot e IA por canal: enciende gasto y envío AUTÓNOMOS, sin nadie delante. */
    'ai:autonomy',
    'module:manage',
    'billing:manage',

    // — Propiedad: quién está en la organización y qué paga —
    'members:manage',
    'plan:manage',
] as const

export type Permission = (typeof PERMISSIONS)[number]

/**
 * Mira y no toca. Es el rol de quien quiere ver el trabajo sin poder romperlo
 * —un socio, un contable, el cliente de una agencia— y TAMBIÉN el rol efectivo
 * con el que un admin de plataforma entra a un tenant sin concesión de soporte
 * viva (F4.4). Esa segunda función es la que evita inventar un rol sintético
 * para la suplantación en lectura: aquí reusa los guards que ya existen.
 *
 * Sólo `content:read`. Ni siquiera `generation:create`, que parece inofensivo y
 * GASTA TOKENS del monedero de la organización.
 */
const VIEWER: readonly Permission[] = ['content:read']

const OPERATOR: readonly Permission[] = [
    ...VIEWER,
    'content:write',
    'content:delete',
    'generation:create',
    'persona:write',
    'inbox:reply',
    'sale:send',
    'publish:social',
]

const ADMIN: readonly Permission[] = [
    ...OPERATOR,
    'avatar:delete',
    'voice:delete',
    'connection:manage',
    'pricing:manage',
    'ai:autonomy',
    'module:manage',
    'billing:manage',
]

const OWNER: readonly Permission[] = [...ADMIN, 'members:manage', 'plan:manage']

/**
 * La matriz. El `satisfies` es la red de seguridad: si el enum SQL crece y
 * alguien añade el rol a `ORG_ROLES` sin darle permisos, `tsc` protesta aquí.
 */
export const PERMISSIONS_BY_ROLE = {
    viewer: new Set(VIEWER),
    operator: new Set(OPERATOR),
    admin: new Set(ADMIN),
    owner: new Set(OWNER),
} satisfies Record<OrgRole, ReadonlySet<Permission>>

/**
 * ¿Puede este rol hacer esto?
 *
 * FALLA CERRADO ante un rol que no conocemos. Es deliberado: el enum de la base
 * puede crecer en una migración sin que nadie toque este fichero, y un rol
 * nuevo que heredase permisos "por parecerse" sería una subida de privilegios
 * silenciosa. Acepta `null`/`undefined` porque la UI pregunta antes de tener
 * contexto resuelto (`usePermission` con sesión a medio cargar).
 */
export function can(
    role: string | null | undefined,
    permission: Permission,
): boolean {
    if (!isOrgRole(role)) return false
    return PERMISSIONS_BY_ROLE[role].has(permission)
}

/** Los permisos de un rol, para depurar y para pintarlos en la pantalla de miembros. */
export function permissionsOf(role: OrgRole): Permission[] {
    return PERMISSIONS.filter((p) => PERMISSIONS_BY_ROLE[role].has(p))
}

/**
 * Estrecha un string cualquiera al enum, para validar lo que llega del cliente.
 *
 * Compara contra la LISTA, no con `value in PERMISSIONS_BY_ROLE`: `in` recorre
 * la cadena de prototipos, así que `'toString'` y `'constructor'` darían `true`
 * y `can()` acabaría llamando `.has` sobre una función. Un rol llamado
 * `constructor` es exactamente el tipo de entrada que manda quien prueba.
 */
export function isOrgRole(value: unknown): value is OrgRole {
    return (
        typeof value === 'string' &&
        (ORG_ROLES as readonly string[]).includes(value)
    )
}

/**
 * `OrgRole` y `OrgMemberRole` deben ser el MISMO conjunto. Si la migración
 * añade un valor al enum y este fichero no se entera, esta línea rompe `tsc` —
 * que es exactamente donde se quiere el aviso, y no en producción.
 */
const _rolesMatchDbEnum: Record<OrgMemberRole, OrgRole> = {
    owner: 'owner',
    admin: 'admin',
    operator: 'operator',
    viewer: 'viewer',
}
void _rolesMatchDbEnum
