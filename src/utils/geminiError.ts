/**
 * Traduce un fallo de la API de Gemini a un mensaje que permita ATRIBUIRLO.
 *
 * POR QUÉ existe: los catch de GeminiService aplanaban cualquier fallo a un
 * "Failed to describe image." La consecuencia real (2026-08-01): Google cortó
 * el proyecto por impago (403 `PERMISSION_DENIED`, "Lightning dunning decision
 * is deny") y la app lo mostró como si la culpa fuera de la IMAGEN — se
 * investigó la foto, el NSFW y el base64 antes de descubrir que ni un "Say OK"
 * de texto plano pasaba. Misma lección que los monederos por proveedor: un
 * fallo hay que poder atribuirlo antes de tocar nada.
 *
 * Este módulo va aparte de GeminiService a propósito: ese archivo es
 * `'use server'` y ahí TODO export debe ser async.
 */

/** Recorte para que la UI no reciba un JSON de error entero. */
const MAX_DETAIL = 200

const detailOf = (e: unknown): string => {
    const raw = e instanceof Error ? e.message : String(e)
    return raw.length > MAX_DETAIL ? `${raw.slice(0, MAX_DETAIL)}…` : raw
}

/** El id de proyecto que viene en el error de Google: sin él no se sabe qué
 * cuenta hay que ir a revisar. */
const projectOf = (raw: string): string => {
    const m = raw.match(/projects\/(\d+)/)
    return m ? ` (project ${m[1]})` : ''
}

/**
 * ¿El fallo es del PROVEEDOR (cuenta caída, sin cuota, servidor roto, red) y no
 * del contenido? Solo entonces vale la pena reintentar en KIE.
 *
 * La distinción es de dinero: un rechazo de contenido o una petición mal armada
 * fallarían igual en KIE — reintentarlos sería pagar dos veces por el mismo no.
 */
export function isProviderOutage(e: unknown): boolean {
    const status = (e as { status?: number } | null)?.status
    if (typeof status === 'number') {
        return status === 403 || status === 429 || status >= 500
    }
    // Sin status: solo la RED cuenta como caída. Los errores locales (base64
    // inválido) y los rechazos de contenido se quedan fuera a propósito.
    const code = (e as { code?: string } | null)?.code ?? ''
    if (/^(ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|EAI_AGAIN)$/.test(code)) {
        return true
    }
    const raw = e instanceof Error ? e.message : String(e)
    return /fetch failed|network error|socket hang up/i.test(raw)
}

export function geminiFailureMessage(e: unknown, fallback: string): string {
    const status = (e as { status?: number } | null)?.status
    const raw = e instanceof Error ? e.message : String(e)

    // Cortes de cuenta: NO son del contenido. Decirlo explícitamente, porque el
    // síntoma aparece en features de imagen y engaña.
    if (status === 403 || /PERMISSION_DENIED|dunning/i.test(raw)) {
        return `Gemini denied the API key (403)${projectOf(raw)} — check the Google Cloud billing for that project. This is NOT about the image or its content.`
    }
    if (status === 429 || /RESOURCE_EXHAUSTED|\bquota\b/i.test(raw)) {
        return `Gemini quota exhausted (429) — wait for the window to reset or raise the limit. This is NOT about the image.`
    }
    if (status === 401 || /API_KEY_INVALID|API key not valid/i.test(raw)) {
        return `Gemini rejected the API key (invalid or missing GEMINI_API_KEY).`
    }
    // 400 = la PETICIÓN iba mal (mime, tamaño, base64): el detalle dice cuál.
    if (status === 400) {
        return `Gemini rejected the request (400): ${detailOf(e)}`
    }
    return `${fallback}: ${detailOf(e)}`
}
