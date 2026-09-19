/**
 * F5.2 (Estratega) — LA PUERTA A META. Un único sitio donde se decide con qué
 * conector, qué permisos y para qué sujeto se pide el token de Vercel
 * Connect, y cómo se traduce "este usuario todavía no ha dado su
 * consentimiento" a algo que la interfaz pueda pintar.
 *
 * EL SUJETO ES EL USUARIO, NO LA APLICACIÓN (decisión de Fase 0, confirmada
 * en el pre-flight del plan): el conector creado el 18-sep sólo admite
 * subject `user` — el consentimiento de Meta es de la persona que tiene
 * acceso a las cuentas publicitarias. Consecuencia asumida: cada miembro de
 * la organización que abra el widget consiente una vez.
 *
 * NUNCA SE LOGUEA UN TOKEN. Ni entero, ni sus últimos caracteres, ni dentro
 * de una URL: `getMetaToken` devuelve el string y nadie más lo toca. Por eso
 * `graph.ts` construye sus errores sin la URL de la petición (que lleva el
 * `access_token` como parámetro).
 *
 * LOS DOS ERRORES DE "FALTA CONSENTIMIENTO" Y POR QUÉ HAY QUE MIRAR LOS DOS:
 *  - `getToken()` (camino Graph API) lanza `UserAuthorizationRequiredError`:
 *    sabe que no hay grant, pero no trae URL de consentimiento.
 *  - El provider con `consent: 'eager'` (camino MCP) convierte ese mismo caso
 *    en `ConsentRequiredError`, que SÍ trae `url` porque antes pidió a
 *    Connect que acuñara el reto.
 * `isMetaConsentRequired` acepta los dos para que ninguna de las dos vías
 * acabe en un 500 con cara de error interno; `metaConsentUrl` devuelve la URL
 * cuando existe y `null` cuando el error no la traía.
 */
import { getToken, UserAuthorizationRequiredError } from '@vercel/connect'
import type { ConnectTokenParams } from '@vercel/connect'
import {
    connectAuthProvider,
    getConsentChallenge,
} from '@vercel/connect/ai-sdk'
import type { OrgContext } from '@/lib/tenant/getOrgContext'

/** Conector de Vercel Connect. El de Fase 0; el env permite apuntar a otro. */
export const META_CONNECTOR =
    process.env.STRATEGIST_MCP_CONNECTOR ?? 'mcp.facebook.com/estratega'

/**
 * Los 7 permisos con los que Fase 0 consiguió autenticarse contra
 * `https://mcp.facebook.com/ads`.
 *
 * NO se recortan "por si acaso": el diálogo de Facebook rechaza la petición
 * entera si alguno de los permisos pedidos no está dado de alta en la app
 * ("necesita al menos un supported permission"), así que esta lista y la
 * configuración de la app de Meta son la misma decisión escrita dos veces.
 */
export const DEFAULT_META_SCOPES = [
    'ads_mcp_management',
    'ads_read',
    'ads_management',
    'catalog_management',
    'business_management',
    'pages_show_list',
    'instagram_basic',
] as const satisfies readonly string[]

/**
 * `"a, b ,,"` → `['a','b']`. Una lista vacía (o sólo comas y espacios) cae a
 * los permisos por defecto: pedir CERO permisos no es "pedir menos", es una
 * petición que Meta rechaza, y el síntoma sería un fallo de consentimiento
 * indiagnosticable por un env mal escrito.
 */
export function parseScopes(raw: string | undefined): string[] {
    const scopes = (raw ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    return scopes.length > 0 ? scopes : [...DEFAULT_META_SCOPES]
}

export const META_SCOPES = parseScopes(process.env.STRATEGIST_META_SCOPES)

/** Los mismos parámetros para las dos vías (Graph y MCP): un solo grant. */
export function metaTokenParams(ctx: OrgContext): ConnectTokenParams {
    return {
        subject: { type: 'user', id: ctx.userId },
        scopes: META_SCOPES,
    }
}

/**
 * Token de Meta para este usuario. Propaga el error TAL CUAL (incluido
 * `UserAuthorizationRequiredError`): quien llama decide si eso es "conecta
 * Meta" o un fallo de verdad — ver `isMetaConsentRequired`.
 */
export async function getMetaToken(ctx: OrgContext): Promise<string> {
    return getToken(META_CONNECTOR, metaTokenParams(ctx))
}

/** ¿Este error significa "el usuario aún no ha autorizado Meta"? */
export function isMetaConsentRequired(error: unknown): boolean {
    return (
        error instanceof UserAuthorizationRequiredError ||
        getConsentChallenge(error) !== undefined
    )
}

/** La URL de consentimiento que trae el error, si la trae. */
export function metaConsentUrl(error: unknown): string | null {
    return getConsentChallenge(error)?.url ?? null
}

export type MetaConnection =
    | { connected: true }
    | { connected: false; consentUrl: string | null }

/**
 * ¿Tiene este usuario a Meta conectado? Y si no, ¿a dónde hay que mandarlo?
 *
 * Usa el provider en modo `eager` porque es el ÚNICO camino que produce una
 * URL de consentimiento sin abrir antes una conexión MCP: `tokens()` pregunta
 * a Connect (que es quien sabe con certeza si hay grant) y, si no lo hay,
 * acuña el reto y lanza `ConsentRequiredError` con la `url` dentro. Con
 * `getToken()` a secas sabríamos que no hay grant pero no a dónde enviar al
 * usuario.
 *
 * Sólo se traga el error de consentimiento. Cualquier otro (el conector mal
 * configurado, Connect caído, sin token OIDC) SE PROPAGA: convertirlo en
 * "no conectado" pintaría un botón de conectar que no arregla nada y
 * escondería una avería de la plataforma.
 */
export async function getMetaConnection(
    ctx: OrgContext,
): Promise<MetaConnection> {
    const provider = connectAuthProvider(META_CONNECTOR, metaTokenParams(ctx), {
        consent: 'eager',
    })
    try {
        const tokens = await provider.tokens()
        // En modo `eager` la ausencia de grant siempre LANZA, así que un
        // undefined aquí sería un cambio de contrato del paquete. Se trata
        // como "no conectado sin URL" en vez de dar por buena una conexión
        // que no hemos visto.
        if (!tokens?.access_token) {
            console.warn(
                '[estratega meta] el provider devolvió tokens vacíos sin lanzar',
                { userId: ctx.userId, organizationId: ctx.organizationId },
            )
            return { connected: false, consentUrl: null }
        }
        return { connected: true }
    } catch (error) {
        if (isMetaConsentRequired(error)) {
            return { connected: false, consentUrl: metaConsentUrl(error) }
        }
        throw error
    }
}
