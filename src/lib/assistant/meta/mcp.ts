/**
 * F5.2 (Estratega) — El MCP oficial de Meta Ads, con LISTA BLANCA.
 *
 * EL DATO QUE MANDA (Fase 0, medido): el servidor sirve 95 herramientas y
 * ~170.000 caracteres de esquema. Ese catálogo entero viaja como tokens de
 * ENTRADA en CADA turno de la conversación, y además incluye herramientas que
 * crean campañas y mueven presupuestos. Exponerlo tal cual sería caro y
 * peligroso a la vez.
 *
 * Por eso aquí no se expone lo que el servidor ofrezca, sino lo que esta lista
 * permite: cinco herramientas de lectura. La lista es POR NOMBRE EXACTO y no
 * por prefijo o palabra ("insight", "get") — un filtro por texto convierte
 * cualquier herramienta nueva del servidor en una herramienta nuestra sin que
 * nadie lo decida, y el día que Meta añada `ads_get_..._and_pause` el filtro
 * la dejaría pasar.
 *
 * El filtro y las medidas son funciones PURAS y testeadas; lo único que toca
 * la red es `openMetaMcpTools`.
 */
import { createMCPClient } from '@ai-sdk/mcp'
import { connectAuthProvider } from '@vercel/connect/ai-sdk'
import type { ToolSet } from 'ai'
import {
    META_CONNECTOR,
    isMetaConsentRequired,
    metaConsentUrl,
    metaTokenParams,
} from './connect'
import type { OrgContext } from '@/lib/tenant/getOrgContext'

/** El endpoint que Fase 0 probó y con el que autenticó. */
export const META_MCP_URL = 'https://mcp.facebook.com/ads'

/**
 * Las ÚNICAS herramientas del MCP que el Estratega puede usar en Fase 1.
 * Todas leen. Fase 0 las ejecutó contra el servidor real.
 */
export const META_MCP_READ_TOOLS = [
    'ads_get_ad_accounts',
    'ads_get_ad_entities',
    'ads_insights_performance_trend',
    'ads_insights_advertiser_context',
    'ads_insights_anomaly_signal',
] as const satisfies readonly string[]

/**
 * Se queda SÓLO con las de la lista blanca.
 *
 * `Object.hasOwn` y no `name in all`: `in` recorre la cadena de prototipos, y
 * una lista blanca con `'constructor'` o `'toString'` acabaría exponiendo una
 * función del prototipo de Object disfrazada de herramienta.
 */
export function filterToolsByWhitelist(
    all: ToolSet,
    whitelist: readonly string[],
): ToolSet {
    const out: ToolSet = {}
    for (const name of whitelist) {
        if (Object.hasOwn(all, name)) out[name] = all[name]
    }
    return out
}

/**
 * Qué herramientas de la lista blanca NO están en el catálogo del servidor.
 *
 * Se mide para poder AVISAR: si Meta renombra o retira una, el síntoma sin
 * este aviso sería "el agente ya no sabe contestar eso", sin causa visible.
 */
export function missingFromWhitelist(
    all: ToolSet,
    whitelist: readonly string[],
): string[] {
    return whitelist.filter((name) => !Object.hasOwn(all, name))
}

/** Tamaño del catálogo en caracteres de esquema: lo que se paga por turno. */
export function schemaCharsOf(tools: ToolSet): number {
    return JSON.stringify(
        Object.fromEntries(
            Object.entries(tools).map(([k, v]) => [
                k,
                {
                    description: v.description ?? '',
                    inputSchema: v.inputSchema ?? null,
                },
            ]),
        ),
    ).length
}

export type MetaMcpTools =
    | {
          ok: true
          tools: ToolSet
          close: () => Promise<void>
          /** Cuántas sirve el servidor (Fase 0: 95). */
          toolCount: number
          /** Cuántas dejamos pasar (≤ lista blanca). */
          exposedCount: number
          /** Caracteres de esquema de las EXPUESTAS, no del catálogo entero. */
          schemaChars: number
      }
    | { ok: false; consentUrl: string | null }

/**
 * Abre el cliente MCP y devuelve sólo las herramientas de la lista blanca.
 *
 * `consent: 'eager'` (decisión de Fase 0): el provider pregunta a Connect
 * ANTES de hablar con Meta, así que la falta de consentimiento aparece en el
 * primer `initialize` y no a mitad de una llamada a herramienta. El baile
 * OAuth propio del SDK de MCP fallaba ("authorization server metadata must be
 * saveable"); con `eager` no llega a intentarlo.
 *
 * QUIEN CIERRA: en el camino feliz devuelve `close` y el llamador (la ruta)
 * lo llama en su `finally` — el cliente tiene que seguir vivo mientras el
 * modelo llame herramientas. En el camino de "falta consentimiento" cierra
 * aquí mismo, porque ya no hay nada que ejecutar.
 *
 * Sólo se traga el error de consentimiento; cualquier otro se propaga para
 * que la ruta lo loguee y el usuario vea que algo falló de verdad.
 */
export async function openMetaMcpTools(
    ctx: OrgContext,
    whitelist: readonly string[] = META_MCP_READ_TOOLS,
): Promise<MetaMcpTools> {
    let client: Awaited<ReturnType<typeof createMCPClient>> | undefined
    try {
        client = await createMCPClient({
            transport: {
                type: 'http',
                url: META_MCP_URL,
                authProvider: connectAuthProvider(
                    META_CONNECTOR,
                    metaTokenParams(ctx),
                    { consent: 'eager' },
                ),
            },
        })
        const all = (await client.tools()) as ToolSet
        const tools = filterToolsByWhitelist(all, whitelist)
        const faltan = missingFromWhitelist(all, whitelist)
        if (faltan.length > 0) {
            console.warn(
                '[estratega meta-mcp] herramientas de la lista blanca ausentes en el catálogo',
                { organizationId: ctx.organizationId, faltan },
            )
        }
        const cliente = client
        return {
            ok: true,
            tools,
            close: () => cliente.close(),
            toolCount: Object.keys(all).length,
            exposedCount: Object.keys(tools).length,
            schemaChars: schemaCharsOf(tools),
        }
    } catch (error) {
        await client?.close().catch((e: unknown) => {
            console.error('[estratega meta-mcp] fallo al cerrar el cliente', {
                organizationId: ctx.organizationId,
                error: e instanceof Error ? e.message : String(e),
            })
        })
        if (isMetaConsentRequired(error)) {
            return { ok: false, consentUrl: metaConsentUrl(error) }
        }
        throw error
    }
}
