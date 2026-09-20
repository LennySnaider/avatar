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

/**
 * Lo que Telegram ACREDITA al desarrollador por cada Star (doc de Telegram
 * Stars / Fragment). No es lo que paga el fan: en tienda una Star le cuesta
 * ~$0.02 porque Apple y Google cobran lo suyo por encima.
 *
 * Se guarda ademas en cada asiento (`metadata.star_usd`) para poder revalorar
 * ventas antiguas si la tasa cambia, sin perder la verdad de lo que se cobro.
 */
export const STAR_USD = 0.013

/** Telegram Stars → USD acreditados al creador. */
export function starsToUsd(stars: number): number {
    return stars * STAR_USD
}

/**
 * USD de INGRESO → tokens. A diferencia de `tokensForCostUsd`, no aplica
 * `COST_MARGIN`: aquel convierte el costo de un proveedor en precio de venta,
 * y una comision o una cuota YA es precio.
 */
export function usdToTokens(usd: number): number {
    if (!(usd > 0)) return 0
    return Math.ceil(usd / TOKEN_USD)
}

/**
 * Sku de los asientos de modulo. Son la clave de lectura de "cuanto me ha
 * costado este modulo", asi que tienen que ser estables.
 */
export const MODULE_SKU = {
    fee: (slug: string) => `module_fee:${slug}`,
    commission: (slug: string) => `commission:${slug}`,
}

type CostEntry = {
    /**
     * USD por imagen, o USD por SEGUNDO en los de video.
     *
     * Cuando hay `porResolucion`, este número es el TRAMO QUE GENERAMOS HOY por
     * defecto — no un promedio. Existe porque no todos los call sites saben la
     * resolución, y un quote sin resolución tiene que seguir dando el precio
     * real del camino habitual, no uno inventado.
     */
    usd: number
    /** true = no medido en vivo; a calibrar con el measure-only. */
    estimated?: boolean
    /**
     * Precio por RESOLUCIÓN, para los proveedores que cobran distinto por cada
     * una. Sin esto el catálogo MIENTE en cuanto alguien sube la calidad:
     * Seedream 5 Pro pasa de $0.035 a $0.07 entre 1K y 2K, y Seedance 2.5 va de
     * $0.14 a $0.57 por segundo entre 480p y 1080p — un factor CUATRO que un
     * único número no puede expresar. Las claves son las mismas que manda el
     * submit ('1K'/'2K' en imagen, '480p'/'720p'/'1080p' en video).
     */
    porResolucion?: Record<string, TramoPrecio>
    /**
     * USD por cada imagen de referencia ADICIONAL a la primera (la primera es
     * gratis). Seedream 5 Pro cobra $0.0025, y Clone Ref manda varias, así que
     * ignorarlo es cobrar de menos en el camino más usado de la app.
     */
    usdPorReferenciaExtra?: number
}

type TramoPrecio = {
    /** USD por imagen, o por segundo de SALIDA en video. */
    usd: number
    /**
     * Precio unitario cuando la petición lleva video de referencia. OJO, no es
     * un descuento: con video de entrada el proveedor cobra
     * `unitario × (entrada + salida)`, así que el unitario baja pero la
     * duración facturable sube. Un clip de 5s con 30s de referencia sale MÁS
     * caro que el mismo clip sin referencia.
     */
    usdConVideoEntrada?: number
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
    // Tarifa de KIE leída de su tabla de precios (2026-09-11): 7cr a 1K y 14cr
    // a 2K, con la misma tarifa en t2i, i2i y layer decomposition. Generamos a
    // 736×1312 (0,97 MP), o sea el tramo 1K — por eso es el `usd` por defecto.
    // El día que se active el 2K, el coste se DUPLICA.
    'kie-seedream-5-pro': {
        usd: 0.035,
        porResolucion: { '1K': { usd: 0.035 }, '2K': { usd: 0.07 } },
        usdPorReferenciaExtra: 0.0025,
    },
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
    // Seedance 2.5 — MEDIDO 2026-09-11 contra la tabla de precios de KIE, que
    // publica SEIS tarifas para este modelo. Estuvo sembrado con el precio del
    // 2.0 ($0.125/s) desde que se cableó: eso cobraba de MENOS por un factor
    // 2,5 en 720p y 4,6 en 1080p. Era el peor agujero del catálogo.
    //
    // 720p es el default de la API, así que es el `usd` por defecto.
    // Los `usdConVideoEntrada` son el precio de la fila "with video" de KIE, y
    // sólo se aplican con la duración de entrada sumada (ver `quote`).
    'kie-seedance-2-5': {
        usd: 0.315,
        porResolucion: {
            '480p': { usd: 0.14, usdConVideoEntrada: 0.085 },
            '720p': { usd: 0.315, usdConVideoEntrada: 0.19 },
            '1080p': { usd: 0.57, usdConVideoEntrada: 0.3425 },
        },
    },
    'kie-wan-2-7': { usd: 0.08, estimated: true },
    // PROVIDER_COST los tenía como "~$0.50 / 5s".
    'mulerouter-wan26-i2v': { usd: 0.1, estimated: true },
    'mulerouter-wan26-t2v': { usd: 0.1, estimated: true },
    'mulerouter-wan26-r2v': { usd: 0.1, estimated: true },
    'minimax-hailuo-2-3': { usd: 0.1, estimated: true },
    'minimax-hailuo-2-3-fast': { usd: 0.06, estimated: true },
    'kie-grok-imagine-video': { usd: 0.1, estimated: true },
    'kie-wan-2-2-uncensored': { usd: 0.08, estimated: true },
    // MEDIDO en vivo 2026-09-19 (créditos antes/después × $0.005), no estimado:
    // 480P/2s=16cr · 480P/5s=40cr · 720P/5s=80cr · 1080P/5s=160cr ·
    // 1080P/15s=480cr. Sale exacto: 8/16/32 créditos por SEGUNDO, lineal en
    // duración y el DOBLE por escalón de resolución. Sin `porResolucion` el
    // catálogo mentiría por un factor 4 entre extremos — y un 1080P de 30s,
    // que son $4.80, se cobraría como si fuese 480p.
    'kie-wan-3-0': {
        usd: 0.08, // tramo por defecto = 720p
        porResolucion: {
            '480p': { usd: 0.04 },
            '720p': { usd: 0.08 },
            '1080p': { usd: 0.16 },
        },
    },
}

/** TTS y clonado — sin medida en vivo todavía (los calibra el measure-only). */
export const TTS_COST_USD_PER_1K_CHARS: CostEntry = { usd: 0.05, estimated: true }
export const VOICE_CLONE_COST_USD: CostEntry = { usd: 0.3, estimated: true }
export const AGENT_MESSAGE_COST_USD: CostEntry = { usd: 0.004, estimated: true }

/**
 * TECHO por turno del Estratega (agente de la organización, F5.2/Fase 1):
 * cuánto se RESERVA con `quote({kind:'assistant_turn'})`, antes de conocer
 * el uso real. NO es el promedio esperado — `wallet_settle` solo puede bajar
 * de lo reservado (`least(p_tokens_final, v_held)`, nunca al alza), así que
 * reservar el promedio ($0.004 medido en Fase 0 para un turno de lectura)
 * capa en silencio cualquier turno más caro. Fase 0 midió hasta $0.043 en el
 * run de catálogo completo (140k tokens con MCP); $0.05 deja margen sobre
 * eso. Measure-only hoy: subir el hold no bloquea a nadie, solo reserva más
 * de la cuenta por turno hasta que el settle la baje al gasto real.
 */
export const ASSISTANT_TURN_CEILING_USD = 0.05

/**
 * Precio POR MILLÓN de tokens de los modelos que usa el Estratega. A
 * diferencia de `ASSISTANT_TURN_CEILING_USD` (el techo que se RESERVA antes
 * del turno), esto factura el USO REAL que devuelve el SDK
 * (`usage.inputTokens`/`outputTokens`) en el settle — de ahí que necesite
 * precio de entrada Y de salida por separado.
 *
 * `gemini-flash-latest` / `gemini-2.5-flash`: precio público de Gemini 2.5
 * Flash (https://ai.google.dev/pricing, leído 2026-09-18) — $0.30/M entrada,
 * $2.50/M salida. Coincide con lo medido en Fase 0: un turno de lectura
 * (~2.6-2.8k tokens) costó ~$0.003-0.004, uno con MCP (~14k tokens) ~$0.007.
 *
 * `gemini-2.5-pro`: mismo doc, tabla "≤200k contexto" — $1.25/M entrada,
 * $10/M salida. Marcado `estimated: true` porque Fase 0 NO corrió el modelo
 * Pro en vivo (solo Flash); es precio de lista, no medido.
 *
 * `'gemini-2.5-flash'` es alias del mismo precio: `ASSISTANT_TOOL_MODEL`
 * (`src/lib/assistant/models.ts`) usa `gemini-flash-latest`, pero el SDK
 * puede resolverlo a `gemini-2.5-flash` en logs/usage — mismo costo, dos
 * strings.
 */
export const MODEL_USD_PER_M: Record<
    string,
    { input: number; output: number; estimated?: boolean }
> = {
    'gemini-flash-latest': { input: 0.3, output: 2.5 },
    'gemini-2.5-flash': { input: 0.3, output: 2.5 },
    'gemini-2.5-pro': { input: 1.25, output: 10, estimated: true },
}

/** Modelo al que cae `tokensForUsage` cuando no reconoce el que le pasan. */
const FALLBACK_ASSISTANT_MODEL = 'gemini-flash-latest'

/** Modelos del Estratega ya avisados por `tokensForUsage` (avisar una vez). */
const warnedUnknownAssistantModels = new Set<string>()

/**
 * Uso real de un turno del Estratega (lo que devuelve el AI SDK) → tokens a
 * cobrar. Es el PRIMO de `quote()` para el asistente: `quote({kind:
 * 'assistant_turn'})` da la estimación PRE-hold (fija), esto da el cobro
 * REAL post-turno con el que se liquida (`settleHold`). Un modelo no listado
 * en `MODEL_USD_PER_M` cae a la tarifa de Flash — igual que el fallback de
 * `IMAGE_COST_USD`/`VIDEO_COST_USD_PER_SECOND`: cobrar de más por un modelo
 * nuevo sin precio es preferible a cobrar cero.
 */
export function tokensForUsage(
    usage: { inputTokens?: number | null; outputTokens?: number | null },
    model: string,
): { tokens: number; costUsd: number; estimated: boolean } {
    let entry = MODEL_USD_PER_M[model]
    let estimated = entry?.estimated ?? false
    if (!entry) {
        if (!warnedUnknownAssistantModels.has(model)) {
            warnedUnknownAssistantModels.add(model)
            console.warn(
                `[billing] modelo del asistente sin precio: ${model} → fallback tarifa Flash`,
            )
        }
        entry = MODEL_USD_PER_M[FALLBACK_ASSISTANT_MODEL]
        estimated = true
    }
    const inputTokens = usage.inputTokens ?? 0
    const outputTokens = usage.outputTokens ?? 0
    const costUsd =
        (entry.input / 1e6) * inputTokens + (entry.output / 1e6) * outputTokens
    return { tokens: tokensForCostUsd(costUsd), costUsd, estimated }
}

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
    // Prefijo LARGO primero por claridad; resolveFamily lo ordena igual. Sin
    // esta línea, 'bytedance/seedance-2-5' haría match con la entrada corta de
    // abajo y se cobraría al precio del 2.0 sin que nada fallara.
    ['bytedance/seedance-2-5', 'kie-seedance-2-5'],
    ['bytedance/seedance', 'kie-seedance-2'],
    ['wan/2-7-image-to-video', 'kie-wan-2-7'],
    ['wan/2-2-a14b', 'kie-wan-2-2-uncensored'],
    ['wan/3-0-video', 'kie-wan-3-0'],
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
    | {
          kind: 'image'
          providerId: string
          count?: number
          /** '1K' / '2K'. Sin ella se cobra el tramo por defecto del proveedor. */
          resolution?: string
          /** Cuántas imágenes de referencia lleva (la primera suele ser gratis). */
          referenceImages?: number
      }
    | {
          kind: 'video'
          providerId: string
          seconds: number
          /** '480p' / '720p' / '1080p'. Sin ella, el tramo por defecto. */
          resolution?: string
          /**
           * Segundos de video de REFERENCIA. Algunos proveedores facturan
           * entrada + salida cuando hay video de entrada; pasarlo a 0 (o no
           * pasarlo) cobra sólo la salida.
           */
          inputSeconds?: number
      }
    | { kind: 'tts'; characters: number }
    | { kind: 'voice_clone' }
    | { kind: 'agent_message' }
    /**
     * Turno del Estratega (agente de la organización, no del avatar). Esta
     * cotización es el TECHO que se reserva ANTES de streamear — no un
     * promedio: `wallet_settle` (supabase/migrations/20260729120000_
     * billing_tokens.sql) hace `least(p_tokens_final, v_held)`, así que un
     * settle JAMÁS puede cobrar más de lo que este hold reservó, solo menos.
     * Si se reservara el promedio medido en Fase 0 ($0.004,
     * `AGENT_MESSAGE_COST_USD`), cualquier turno con herramientas MCP (Fase 0
     * midió hasta $0.043 en el run de catálogo completo) se cobraría de MENOS
     * sin que nada lo avisara — el `least` lo capa en silencio. Por eso el
     * hold usa `ASSISTANT_TURN_CEILING_USD` (con `maxTokens` para que el
     * caller lo sobrescriba con el tope de `org_modules.settings`, F1/Task 4).
     * El cobro DEFINITIVO sale de `tokensForUsage(usage, model)` con el uso
     * real del SDK, en el settle (ver `src/lib/assistant/billing.ts`).
     */
    | { kind: 'assistant_turn'; maxTokens?: number }

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
            const tramo = op.resolution
                ? entry?.porResolucion?.[op.resolution]
                : undefined
            const unitario = tramo?.usd ?? entry?.usd ?? UNKNOWN_IMAGE_USD
            // La PRIMERA referencia es gratis en los proveedores que las
            // cobran; sólo se factura a partir de la segunda.
            const refsExtra = Math.max(0, (op.referenceImages ?? 0) - 1)
            const costUsd =
                unitario * count + refsExtra * (entry?.usdPorReferenciaExtra ?? 0)
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
            const tramo = op.resolution
                ? entry?.porResolucion?.[op.resolution]
                : undefined
            const entrada = Math.max(0, op.inputSeconds ?? 0)
            // Con video de referencia el proveedor cobra un unitario más bajo
            // pero sobre entrada + salida. NO es un descuento: 5s de salida con
            // 30s de referencia salen más caros que los mismos 5s a secas.
            const conEntrada = entrada > 0 && tramo?.usdConVideoEntrada != null
            const unitario = conEntrada
                ? (tramo.usdConVideoEntrada as number)
                : (tramo?.usd ?? entry?.usd ?? UNKNOWN_VIDEO_USD_PER_SECOND)
            const facturables = conEntrada ? seconds + entrada : seconds
            const costUsd = unitario * facturables
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
        case 'assistant_turn': {
            // `maxTokens` (el tope de `org_modules.settings`, ver Task 4) manda
            // sobre el techo por defecto: si el caller ya sabe cuántos tokens
            // quiere reservar como máximo, ese es el hold. `costUsd` se deriva
            // del mismo número (inverso de `tokensForCostUsd`) para que quede
            // consistente con `tokens` — no es un segundo precio independiente.
            const tokens = op.maxTokens ?? tokensForCostUsd(ASSISTANT_TURN_CEILING_USD)
            const costUsd =
                op.maxTokens != null
                    ? (tokens * TOKEN_USD) / COST_MARGIN
                    : ASSISTANT_TURN_CEILING_USD
            return {
                sku: 'assistant_turn',
                tokens,
                costUsd,
                estimated: true,
            }
        }
    }
}
