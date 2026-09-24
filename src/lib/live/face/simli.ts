/**
 * Simli (https://simli.com) — cara en tiempo real barata (menos de un
 * centavo por minuto), pero de aspecto 3D. Se conserva como alternativa
 * económica; el proveedor por defecto para calidad es Anam (`./anam.ts`).
 *
 * SÓLO SERVIDOR: usa SIMLI_API_KEY. El `session_token` es lo único que viaja
 * al navegador (`simli-client` → `new SimliClient(token, video, audio, null,
 * …, 'livekit')`). Mismo endpoint y cuerpo que `generateSimliSessionToken`
 * del SDK, sólo que aquí la API key no sale de Vercel.
 */
import type { FaceClientConfig, MintFaceSessionInput } from './types'

const SIMLI_API_BASE = 'https://api.simli.ai'

function apiKey(): string {
    const key = process.env.SIMLI_API_KEY
    if (!key) throw new Error('SIMLI_API_KEY is not defined')
    return key
}

export async function mintSimliSession(input: MintFaceSessionInput): Promise<FaceClientConfig> {
    const res = await fetch(`${SIMLI_API_BASE}/compose/token`, {
        method: 'POST',
        headers: {
            'x-simli-api-key': apiKey(),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            faceId: input.faceId,
            apiVersion: 'v2',
            handleSilence: true,
            maxSessionLength: input.maxSessionSeconds,
            maxIdleTime: input.maxIdleSeconds,
            audioInputFormat: 'pcm16',
        }),
    })
    const raw = await res.text()
    if (!res.ok) throw new Error(`Simli session token failed (${res.status}): ${raw.slice(0, 300)}`)
    let json: { session_token?: string; detail?: string }
    try {
        json = JSON.parse(raw) as { session_token?: string; detail?: string }
    } catch {
        throw new Error('Simli session token: respuesta no es JSON')
    }
    if (!json.session_token || json.session_token === 'FAIL TOKEN') {
        throw new Error(`Simli session token rechazado: ${json.detail ?? 'sin detalle'}`)
    }
    return { provider: 'simli', sessionToken: json.session_token }
}
