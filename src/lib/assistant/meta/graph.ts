/**
 * F5.2 (Estratega) — Lectura DIRECTA de la Graph API de Meta con el token de
 * Vercel Connect.
 *
 * POR QUÉ EXISTE HABIENDO UN MCP: Fase 0 dejó las dos vías vivas a propósito.
 * El MCP es cómodo pero caro (95 herramientas, ~170k caracteres de esquema) y
 * depende de permisos que la app puede no tener concedidos
 * (`ads_mcp_management`). La Graph API responde los mismos insights con una
 * llamada HTTP y CERO tokens de catálogo, así que es el camino barato y el
 * que sigue funcionando si el MCP se cae o cambia.
 *
 * EL TOKEN VIAJA EN LA QUERY (`access_token=…`) y no en una cabecera
 * `Authorization` — que es el camino que Fase 0 midió funcionando de verdad.
 * No se cambia a la cabecera "porque suele funcionar": eso sería una
 * suposición sin medir, y el coste de equivocarse es que la única vía barata
 * a Meta deje de responder. La contrapartida es que la URL lleva un secreto,
 * así que NINGÚN error, log ni mensaje de esta función incluye la URL: sólo
 * el `path` (que no tiene secretos), el status y el cuerpo recortado.
 *
 * La versión se fija en `v26.0` (la de Fase 0): la Graph API cambia de
 * comportamiento entre versiones y dejarla implícita significa que Meta
 * decide por nosotros el día que jubile la que usamos.
 */
import { getMetaToken } from './connect'
import type { OrgContext } from '@/lib/tenant/getOrgContext'

export const GRAPH_API_VERSION = 'v26.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`

/** Cuánto cuerpo de respuesta se conserva en el error. Suficiente para el
 *  `error.message`/`error.code` de Meta, poco para inundar un log. */
const MAX_BODY_CHARS = 400

/**
 * Error tipado de la Graph API: el llamador puede distinguir "Meta dijo que
 * no" de "no pude hablar con Meta" sin parsear cadenas.
 */
export class GraphApiError extends Error {
    readonly name = 'GraphApiError'
    readonly status: number
    /** Cuerpo de la respuesta, recortado. Nunca contiene la URL ni el token. */
    readonly body: string
    readonly path: string

    constructor(path: string, status: number, body: string) {
        super(`Graph API ${status} en ${path}: ${body}`)
        this.status = status
        this.body = body
        this.path = path
    }
}

/**
 * GET contra la Graph API. `path` sin barra inicial (`me/adaccounts`,
 * `act_123/insights`).
 *
 * Devuelve el JSON tal cual: quien llama sabe qué campos pidió. El genérico
 * es una PROMESA del llamador, no una validación — Meta puede devolver menos
 * campos de los pedidos, así que todo lo que se lea de aquí debe tratarse
 * como opcional.
 */
export async function graphGet<T>(
    ctx: OrgContext,
    path: string,
    params: Record<string, string> = {},
): Promise<T> {
    const url = new URL(`${GRAPH_BASE}/${path}`)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    url.searchParams.set('access_token', await getMetaToken(ctx))

    const res = await fetch(url)
    const text = await res.text()
    if (!res.ok) {
        // Sin `url` en el error, a propósito: lleva el access_token dentro.
        throw new GraphApiError(path, res.status, text.slice(0, MAX_BODY_CHARS))
    }
    try {
        return JSON.parse(text) as T
    } catch {
        // 200 con un cuerpo que no es JSON: es raro, y callarlo dejaría al
        // modelo con un `undefined` que interpretaría como "no hay datos".
        throw new GraphApiError(
            path,
            res.status,
            `respuesta no-JSON: ${text.slice(0, MAX_BODY_CHARS)}`,
        )
    }
}
