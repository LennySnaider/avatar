/**
 * Traducción de una petición de Gemini a la forma que espera el endpoint chat de
 * KIE. Vive aparte del cliente para poder probarla SIN red: es donde de verdad
 * se pueden colar los errores (orden de las imágenes, tipos del schema), y no
 * hace falta gastar créditos para verificarlos.
 *
 * Contrato de KIE (verificado 2026-08-01 contra la API real):
 *   POST https://api.kie.ai/gemini-2.5-flash/v1/chat/completions
 *   OpenAI-compatible y SÍNCRONO — nada del createTask/recordInfo asíncrono que
 *   usa el resto de KIE en este repo.
 *   Doc: https://docs.kie.ai/market/gemini/gemini-2-5-flash
 */

export const KIE_CHAT_MODEL = 'gemini-2.5-flash'
export const KIE_CHAT_URL = `https://api.kie.ai/${KIE_CHAT_MODEL}/v1/chat/completions`

/** Trozo de `contents.parts` de Gemini: o imagen inline, o texto. */
export interface GeminiPart {
    inlineData?: { mimeType: string; data: string }
    text?: string
}

type KieContent =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }

export interface KieChatBody {
    model: string
    messages: { role: 'user'; content: KieContent[] }[]
    stream: false
    response_format?: {
        type: 'json_schema'
        json_schema: {
            name: string
            strict: boolean
            schema: Record<string, unknown>
        }
    }
}

/**
 * Los tipos del `responseSchema` de Gemini son constantes en MAYÚSCULA
 * (`Type.OBJECT` → `'OBJECT'`), mientras que JSON Schema los quiere en
 * minúscula. Sin bajarlos, KIE rechaza el schema — y hay que hacerlo en
 * profundidad, porque `items`/`properties` anidan más tipos.
 */
function toJsonSchema(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(toJsonSchema)
    if (!node || typeof node !== 'object') return node

    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        out[key] =
            key === 'type' && typeof value === 'string'
                ? value.toLowerCase()
                : toJsonSchema(value)
    }
    return out
}

/** El base64 puede venir ya con el prefijo `data:` — no envolverlo dos veces. */
function toDataUri(mimeType: string, data: string): string {
    return data.startsWith('data:') ? data : `data:${mimeType};base64,${data}`
}

export function toKieChatBody(req: {
    parts: GeminiPart[]
    responseSchema?: Record<string, unknown>
}): KieChatBody {
    const content: KieContent[] = []
    for (const part of req.parts) {
        if (part.inlineData) {
            content.push({
                type: 'image_url',
                image_url: {
                    url: toDataUri(part.inlineData.mimeType, part.inlineData.data),
                },
            })
        } else if (typeof part.text === 'string') {
            content.push({ type: 'text', text: part.text })
        }
    }

    return {
        model: KIE_CHAT_MODEL,
        messages: [{ role: 'user', content }],
        stream: false,
        ...(req.responseSchema
            ? {
                  response_format: {
                      type: 'json_schema' as const,
                      json_schema: {
                          name: 'structured_output',
                          strict: true,
                          schema: toJsonSchema(req.responseSchema) as Record<
                              string,
                              unknown
                          >,
                      },
                  },
              }
            : {}),
    }
}
