/**
 * Cliente del endpoint chat de KIE — el respaldo de Gemini cuando Google corta
 * el proyecto (403 dunning) o se agota la cuota.
 *
 * Es el MISMO modelo (`gemini-2.5-flash`), solo que facturado por KIE: los
 * prompts, las reglas de vocabulario y los resultados siguen siendo los de
 * siempre. Lo único que cambia es el monedero — y por eso cada uso se registra
 * con `via`, para poder atribuir el gasto (un corte largo de Google drena el
 * saldo de KIE en silencio).
 *
 * OJO: KIE **no expone `safetySettings`**. Las llamadas que en Google van con
 * `BLOCK_NONE` aquí caen al default (más restrictivo), así que con refs
 * sugerentes el respaldo puede rehusar donde el directo pasaba. Es un modo
 * degradado a propósito, no un reemplazo equivalente.
 */

import { toKieChatBody, KIE_CHAT_URL, type GeminiPart } from './kieChatPayload'

const getKieKey = (): string => {
    const key = process.env.KIE_API_KEY
    if (!key) throw new Error('KIE_API_KEY is not configured')
    return key
}

/**
 * Ejecuta la petición contra KIE y devuelve el texto. Lanza con el detalle de
 * la API si algo va mal: este es el ÚLTIMO recurso, y un fallo silencioso aquí
 * dejaría al usuario sin saber que se quedó sin los dos proveedores.
 */
export async function kieChatCompletion(req: {
    parts: GeminiPart[]
    responseSchema?: Record<string, unknown>
}): Promise<string> {
    const res = await fetch(KIE_CHAT_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${getKieKey()}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(toKieChatBody(req)),
    })

    const bodyText = await res.text()
    if (!res.ok) {
        throw new Error(
            `KIE chat failed (HTTP ${res.status}): ${bodyText.slice(0, 200)}`,
        )
    }

    let parsed: {
        choices?: { message?: { content?: string } }[]
    }
    try {
        parsed = JSON.parse(bodyText)
    } catch {
        throw new Error(
            `KIE chat returned non-JSON: ${bodyText.slice(0, 200)}`,
        )
    }

    const text = parsed.choices?.[0]?.message?.content
    if (!text) {
        // Sin texto y sin error HTTP = rechazo de contenido del lado de KIE.
        // Se distingue del fallo de transporte porque el arreglo es otro.
        throw new Error('KIE chat returned an empty completion')
    }
    return text
}
