/**
 * F5.2 (Estratega) — Herramientas de lectura de META ADS por Graph API.
 *
 * Es el camino BARATO a Meta (ver `../../meta/graph.ts`): dos herramientas
 * con su esquema, frente a las 95 del MCP. Cubren lo que se pregunta el 90%
 * de las veces: qué cuentas publicitarias hay y cómo van sus campañas.
 *
 * FALTA DE CONSENTIMIENTO ≠ ERROR. Si el usuario todavía no ha autorizado
 * Meta, estas herramientas devuelven `{ error: 'meta_not_connected' }` como
 * DATO en vez de lanzar. Lanzar convertiría un estado normal y esperado (aún
 * no has conectado Meta) en un fallo del turno; devolviéndolo, el modelo lo
 * lee, se lo explica al usuario y le manda al botón que ya está en la
 * pantalla. Cualquier otro fallo de Meta SÍ se propaga: un 500 de Graph no es
 * "no conectado" y esconderlo dejaría al agente diciendo que no hay datos
 * cuando lo que hay es una avería.
 */
import { z } from 'zod'
import { graphGet } from '../../meta/graph'
import { isMetaConsentRequired } from '../../meta/connect'
import type { AssistantScreen, AssistantToolDef, ToolEnv } from '../../types'

/** Lo que se devuelve cuando el usuario no ha autorizado Meta todavía. */
const NOT_CONNECTED = {
    error: 'meta_not_connected',
    message:
        'La cuenta de Meta no está conectada para este usuario. Hay que autorizarla con el botón "Conectar Meta" de este panel.',
} as const

/**
 * Pantallas donde Meta Ads tiene sentido. El estudio queda fuera a propósito:
 * allí se crea contenido, y cargar dos herramientas de anuncios en cada turno
 * de esa pantalla es pagar tokens por algo que nadie va a preguntar.
 */
const META_SCREENS: AssistantScreen[] = [
    'social-accounts',
    'social-posts',
    'other',
]

/** Ejecuta la lectura y traduce SÓLO la falta de consentimiento. */
async function conMeta<T>(
    fn: () => Promise<T>,
): Promise<T | typeof NOT_CONNECTED> {
    try {
        return await fn()
    } catch (error) {
        if (isMetaConsentRequired(error)) return NOT_CONNECTED
        throw error
    }
}

const sinEntrada = z.object({})

export const listMetaAdAccounts: AssistantToolDef<z.infer<typeof sinEntrada>> =
    {
        name: 'listMetaAdAccounts',
        description:
            'Cuentas publicitarias de Meta a las que tiene acceso el usuario conectado (nombre, id con prefijo act_, moneda, gasto acumulado y estado). Necesaria antes de pedir insights.',
        inputSchema: sinEntrada,
        permission: 'content:read',
        screens: META_SCREENS,
        mutating: false,
        async execute(_input, { ctx }: ToolEnv) {
            return conMeta(() =>
                graphGet(ctx, 'me/adaccounts', {
                    fields: 'name,account_id,currency,amount_spent,account_status',
                    limit: '25',
                }),
            )
        },
    }

const insightsInput = z.object({
    accountId: z
        .string()
        .describe(
            'Id de la cuenta publicitaria CON el prefijo act_, tal y como lo devuelve listMetaAdAccounts.',
        ),
    datePreset: z
        .enum(['last_7d', 'last_30d', 'last_90d', 'this_month', 'last_month'])
        .default('last_30d')
        .describe('Periodo del informe. Cítalo siempre en la respuesta.'),
    level: z
        .enum(['account', 'campaign'])
        .default('campaign')
        .describe(
            'account = una sola fila con el total; campaign = una fila por campaña.',
        ),
})

export const getMetaAdAccountInsights: AssistantToolDef<
    z.infer<typeof insightsInput>
> = {
    name: 'getMetaAdAccountInsights',
    description:
        'Rendimiento de una cuenta publicitaria de Meta: gasto, impresiones, clics, CTR, CPC y alcance, por campaña o en total, en el periodo pedido.',
    inputSchema: insightsInput,
    permission: 'content:read',
    screens: META_SCREENS,
    mutating: false,
    async execute({ accountId, datePreset, level }, { ctx }: ToolEnv) {
        return conMeta(() =>
            graphGet(ctx, `${accountId}/insights`, {
                date_preset: datePreset,
                level,
                fields: 'campaign_name,spend,impressions,clicks,ctr,cpc,reach,date_start,date_stop',
                limit: '50',
            }),
        )
    },
}
