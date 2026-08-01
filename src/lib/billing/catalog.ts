/**
 * F5.1 — Catálogo de costos y conversión a tokens. Módulo PURO (solo
 * aritmética y datos): lo importan servicios de servidor y también la UI para
 * mostrar "esto te va a costar N tokens" antes de generar.
 *
 * POR QUÉ EXISTE APARTE DE `providerCatalog.PROVIDER_COST`: ese mapa es de UI
 * y guarda STRINGS ("~$0.09") para pintar en una card. No se puede cobrar con
 * eso — hay que parsear, el "~" se pierde, y el video ni siquiera tiene un
 * precio por unidad (cobra POR SEGUNDO, así que el precio depende de la
 * duración pedida). Aquí los costos son numéricos y el servidor es la única
 * autoridad: el cliente puede pedir un descuento en su request, pero el cobro
 * se calcula de nuevo aquí.
 *
 * FUENTE de los números: medidas reales de KIE (créditos × $0.005) y
 * `docs/cost-routing.md`. Los marcados `estimated` NO están medidos en vivo —
 * el measure-only de F5.5 es justamente lo que los calibra antes de que el
 * enforcement dependa de ellos.
 */

/** Precio al cliente de 1 token. Es una constante de NEGOCIO, no un costo. */
export const TOKEN_USD = 0.001

/**
 * Margen bruto objetivo sobre el costo del proveedor. Con 3×, un token nos
 * cuesta $0.000333 y se vende a $0.001. Subir esto NO cambia lo que el cliente
 * ve por token — cambia cuántos tokens cuesta cada generación.
 */
export const COST_MARGIN = 3

/** Costo del proveedor → tokens que se le cobran al cliente. */
export function tokensForCostUsd(costUsd: number): number {
    return Math.ceil((costUsd * COST_MARGIN) / TOKEN_USD)
}

type CostEntry = {
    /** USD por imagen, o USD por SEGUNDO en los de video. */
    usd: number
    /** true = no medido en vivo; a calibrar con el measure-only. */
    estimated?: boolean
}

/**
 * Costo POR IMAGEN. Medidos en vivo salvo los marcados.
 * (KIE cobra en créditos a $0.005: z-image 0.8cr, grok 4cr, seedream 5-lite
 * 5.5cr, seedream 4.5 6.5cr, flux-2 7cr, nano-banana-2 12cr…)
 */
export const IMAGE_COST_USD: Record<string, CostEntry> = {
    'gemini-nano-banana': { usd: 0.13, estimated: true },
    'gemini-flash-lite-image': { usd: 0.02, estimated: true },
    'kie-nano-banana-pro': { usd: 0.09 },
    'minimax-image-01': { usd: 0.01, estimated: true },
    'kie-flux-kontext': { usd: 0.04 },
    'kie-flux-kontext-max': { usd: 0.08 },
    'kie-gpt-4o-image': { usd: 0.03 },
    'kie-gpt-image-2': { usd: 0.03 },
    'kie-seedream-4-5': { usd: 0.033 },
    'kie-flux-2-pro': { usd: 0.035 },
    'kie-seedream-5-lite': { usd: 0.028 },
    'kie-seedream-5-pro': { usd: 0.035 },
    'kie-qwen-image': { usd: 0.02, estimated: true },
    'mulerouter-qwen-edit-max': { usd: 0.075 },
    // Mismo API, tier económico (docs MuleRouter 2026-07-25).
    'mulerouter-qwen-edit-plus': { usd: 0.03 },
    'kie-ideogram-v3': { usd: 0.05, estimated: true },
    'kie-nano-banana-2': { usd: 0.06 },
    'kie-nano-banana-2-lite': { usd: 0.034 },
    'kie-grok-imagine': { usd: 0.02 },
    'kie-wan-image': { usd: 0.024 },
    'kie-wan-image-pro': { usd: 0.06 },
}

/**
 * Costo POR SEGUNDO de video. Ojo: para los que se quedaron DIRECTOS por
 * features (Kling con voz/Omni, Veo de GeminiService) el costo es el oficial
 * del proveedor, más alto que el equivalente en KIE — está así a propósito,
 * porque es lo que de verdad se paga.
 */
export const VIDEO_COST_USD_PER_SECOND: Record<string, CostEntry> = {
    // Vertex, tarifa oficial de cost-routing.md. Es el SKU más caro de la app.
    'gemini-veo-3-1': { usd: 0.75 },
    // Kling directo, 1080p sin audio ($0.112) — con audio sube a $0.168.
    'kling-v3': { usd: 0.112 },
    'kie-kling-3-0': { usd: 0.09 },
    'kling-v2-6': { usd: 0.07 },
    'kling-v1-6': { usd: 0.07, estimated: true },
    'kling-v1-5': { usd: 0.07, estimated: true },
    // Seedance 2.0 a 720p en KIE.
    'kie-seedance-2': { usd: 0.125 },
    'kie-wan-2-7': { usd: 0.08, estimated: true },
    // PROVIDER_COST los tenía como "~$0.50 / 5s".
    'mulerouter-wan26-i2v': { usd: 0.1, estimated: true },
    'mulerouter-wan26-t2v': { usd: 0.1, estimated: true },
    'mulerouter-wan26-r2v': { usd: 0.1, estimated: true },
    'minimax-hailuo-2-3': { usd: 0.1, estimated: true },
    'minimax-hailuo-2-3-fast': { usd: 0.06, estimated: true },
    'kie-grok-imagine-video': { usd: 0.1, estimated: true },
    'kie-wan-2-2-uncensored': { usd: 0.08, estimated: true },
}

/** TTS y clonado — sin medida en vivo todavía (los calibra el measure-only). */
export const TTS_COST_USD_PER_1K_CHARS: CostEntry = { usd: 0.05, estimated: true }
export const VOICE_CLONE_COST_USD: CostEntry = { usd: 0.3, estimated: true }
export const AGENT_MESSAGE_COST_USD: CostEntry = { usd: 0.004, estimated: true }

/**
 * Fallback para un provider que no esté en las tablas. Deliberadamente NO es 0:
 * un SKU desconocido con costo cero sería una puerta gratis a la generación más
 * cara de la app en cuanto alguien añada un provider y olvide su precio. Se
 * cobra el techo de su categoría y se deja rastro para corregirlo.
 */
const UNKNOWN_IMAGE_USD = 0.13
const UNKNOWN_VIDEO_USD_PER_SECOND = 0.2

/**
 * Model string del proveedor → providerId del catálogo.
 *
 * POR QUÉ NO ES UN MATCH EXACTO contra `DEFAULT_PROVIDERS[].model`: el model
 * que llega en runtime suele ser una VARIANTE del declarado en el catálogo. El
 * selector dice `seedream/4.5-text-to-image`, pero cuando hay cara la ruta i2i
 * manda `seedream/4.5-edit` — mismo precio, otro string. Con match exacto la
 * mitad de las generaciones reales caerían al fallback caro y el medidor
 * mentiría justo en el camino más usado.
 *
 * Por familia y por PREFIJO MÁS LARGO PRIMERO: 'nano-banana-2-lite' tiene que
 * ganarle a 'nano-banana-2', y 'wan/2-7-image-pro' a 'wan/2-7-image'.
 */
const IMAGE_MODEL_FAMILIES: Array<[prefix: string, providerId: string]> = [
    ['seedream/4.5', 'kie-seedream-4-5'],
    ['seedream/5-lite', 'kie-seedream-5-lite'],
    ['seedream/5-pro', 'kie-seedream-5-pro'],
    ['nano-banana-pro', 'kie-nano-banana-pro'],
    ['nano-banana-2-lite', 'kie-nano-banana-2-lite'],
    ['nano-banana-2', 'kie-nano-banana-2'],
    ['gpt-image-2', 'kie-gpt-image-2'],
    ['gpt-4o-image', 'kie-gpt-4o-image'],
    ['flux-kontext-max', 'kie-flux-kontext-max'],
    ['flux-kontext', 'kie-flux-kontext'],
    ['flux-2/', 'kie-flux-2-pro'],
    ['qwen2/', 'kie-qwen-image'],
    ['mulerouter/qwen', 'mulerouter-qwen-edit-max'],
    ['ideogram/', 'kie-ideogram-v3'],
    ['grok-imagine/', 'kie-grok-imagine'],
    ['wan/2-7-image-pro', 'kie-wan-image-pro'],
    ['wan/2-7-image', 'kie-wan-image'],
    ['gemini-3-pro-image', 'gemini-nano-banana'],
    ['gemini-3.1-flash-lite-image', 'gemini-flash-lite-image'],
    ['image-01', 'minimax-image-01'],
]

const VIDEO_MODEL_FAMILIES: Array<[prefix: string, providerId: string]> = [
    ['veo-', 'gemini-veo-3-1'],
    ['kling-3.0', 'kie-kling-3-0'],
    ['kling-v3', 'kling-v3'],
    ['kling-v2-6', 'kling-v2-6'],
    ['kling-v1-6', 'kling-v1-6'],
    ['kling-v1-5', 'kling-v1-5'],
    ['minimax-hailuo-2.3-fast', 'minimax-hailuo-2-3-fast'],
    ['minimax-hailuo', 'minimax-hailuo-2-3'],
    ['bytedance/seedance', 'kie-seedance-2'],
    ['wan/2-7-image-to-video', 'kie-wan-2-7'],
    ['wan/2-2-a14b', 'kie-wan-2-2-uncensored'],
    ['grok-imagine-video', 'kie-grok-imagine-video'],
    ['mulerouter/wan2.6-i2v', 'mulerouter-wan26-i2v'],
    ['mulerouter/wan2.6-t2v', 'mulerouter-wan26-t2v'],
    ['mulerouter/wan2.6-r2v', 'mulerouter-wan26-r2v'],
    // Card unificado 'mulerouter/wan2.6' (la variante se enruta en el submit):
    // el hold real siempre llega con la variante concreta, pero si algún camino
    // resolviera el model del catálogo tal cual, que caiga al precio i2v y no
    // al fallback sin precio. resolveFamily ordena por prefijo más largo, así
    // que esta entrada corta NUNCA pisa a las tres de arriba.
    ['mulerouter/wan2.6', 'mulerouter-wan26-i2v'],
]

function resolveFamily(
    model: string,
    families: Array<[string, string]>,
): string | null {
    const needle = model.toLowerCase()
    // Prefijo más largo primero: el orden de la tabla no basta si alguien añade
    // una entrada corta arriba, y esto lo hace independiente del orden.
    const sorted = [...families].sort((a, b) => b[0].length - a[0].length)
    for (const [prefix, id] of sorted) {
        if (needle.startsWith(prefix.toLowerCase())) return id
    }
    return null
}

/** providerId de un model de imagen (o el model tal cual, que cae al fallback). */
export function resolveImageProviderId(model: string): string {
    return resolveFamily(model, IMAGE_MODEL_FAMILIES) ?? model
}

/** providerId de un model de video (o el model tal cual, que cae al fallback). */
export function resolveVideoProviderId(model: string): string {
    return resolveFamily(model, VIDEO_MODEL_FAMILIES) ?? model
}

/** Operación que consume tokens. La UNIDAD del cobro. */
export type PaidOperation =
    | { kind: 'image'; providerId: string; count?: number }
    | { kind: 'video'; providerId: string; seconds: number }
    | { kind: 'tts'; characters: number }
    | { kind: 'voice_clone' }
    | { kind: 'agent_message' }

export type Quote = {
    /** Identificador estable del SKU para el ledger ('image:kie-seedream-5-lite'). */
    sku: string
    tokens: number
    costUsd: number
    /** El precio viene de una estimación, no de una medida en vivo. */
    estimated: boolean
}

/**
 * Cotiza una operación. ÚNICA función que decide cuánto cuesta algo — tanto el
 * preview de la UI como el cobro del servidor pasan por aquí, así que no puede
 * haber desacuerdo entre lo que se le prometió al usuario y lo que se le cobró.
 */
export function quote(op: PaidOperation): Quote {
    switch (op.kind) {
        case 'image': {
            const entry = IMAGE_COST_USD[op.providerId]
            if (!entry) {
                console.warn(
                    `[billing] provider de imagen sin precio: ${op.providerId} → fallback $${UNKNOWN_IMAGE_USD}`,
                )
            }
            const count = Math.max(1, op.count ?? 1)
            const costUsd = (entry?.usd ?? UNKNOWN_IMAGE_USD) * count
            return {
                sku: `image:${op.providerId}`,
                tokens: tokensForCostUsd(costUsd),
                costUsd,
                estimated: entry?.estimated ?? true,
            }
        }
        case 'video': {
            const entry = VIDEO_COST_USD_PER_SECOND[op.providerId]
            if (!entry) {
                console.warn(
                    `[billing] provider de video sin precio: ${op.providerId} → fallback $${UNKNOWN_VIDEO_USD_PER_SECOND}/s`,
                )
            }
            // Un video de 0s no existe: sin duración se cobra el clip mínimo
            // típico (5s) en vez de salir gratis.
            const seconds = op.seconds > 0 ? op.seconds : 5
            const costUsd =
                (entry?.usd ?? UNKNOWN_VIDEO_USD_PER_SECOND) * seconds
            return {
                sku: `video:${op.providerId}`,
                tokens: tokensForCostUsd(costUsd),
                costUsd,
                estimated: entry?.estimated ?? true,
            }
        }
        case 'tts': {
            const costUsd =
                (TTS_COST_USD_PER_1K_CHARS.usd * Math.max(0, op.characters)) /
                1000
            return {
                sku: 'tts:minimax',
                tokens: tokensForCostUsd(costUsd),
                costUsd,
                estimated: true,
            }
        }
        case 'voice_clone':
            return {
                sku: 'voice_clone:minimax',
                tokens: tokensForCostUsd(VOICE_CLONE_COST_USD.usd),
                costUsd: VOICE_CLONE_COST_USD.usd,
                estimated: true,
            }
        case 'agent_message':
            return {
                sku: 'agent_message',
                tokens: tokensForCostUsd(AGENT_MESSAGE_COST_USD.usd),
                costUsd: AGENT_MESSAGE_COST_USD.usd,
                estimated: true,
            }
    }
}
