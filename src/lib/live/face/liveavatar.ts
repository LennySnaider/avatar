/**
 * LiveAvatar de HeyGen (https://liveavatar.com), modo LITE: LiveAvatar sólo
 * genera la cara a partir del audio que le mandamos. La escucha, el cerebro
 * y la voz clonada siguen siendo nuestros. Cuesta 1 crédito por minuto.
 *
 * SÓLO SERVIDOR: usa LIVEAVATAR_API_KEY (cabecera `X-API-KEY`). El
 * `session_token` es lo único que viaja al navegador; allí el SDK
 * `@heygen/liveavatar-web-sdk` arranca la sesión, entra en la sala de
 * LiveKit y abre el WebSocket de comandos (`agent.speak`, PCM16 24 kHz).
 *
 * `LIVEAVATAR_SANDBOX=true` abre sesiones de prueba que no gastan créditos.
 */
import type { FaceClientConfig, MintFaceSessionInput } from './types'

const LIVEAVATAR_API_BASE = 'https://api.liveavatar.com/v1'

function apiKey(): string {
    const key = process.env.LIVEAVATAR_API_KEY
    if (!key) throw new Error('LIVEAVATAR_API_KEY is not defined')
    return key
}

export async function mintLiveAvatarSession(input: MintFaceSessionInput): Promise<FaceClientConfig> {
    const res = await fetch(`${LIVEAVATAR_API_BASE}/sessions/token`, {
        method: 'POST',
        headers: { 'X-API-KEY': apiKey(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
            mode: 'LITE',
            avatar_id: input.faceId,
            is_sandbox: process.env.LIVEAVATAR_SANDBOX === 'true',
            max_session_duration: input.maxSessionSeconds,
        }),
    })
    const raw = await res.text()
    if (!res.ok) throw new Error(`LiveAvatar session token failed (${res.status}): ${raw.slice(0, 300)}`)
    let json: { data?: { session_token?: string } }
    try {
        json = JSON.parse(raw) as typeof json
    } catch {
        throw new Error('LiveAvatar session token: respuesta no es JSON')
    }
    const token = json.data?.session_token
    if (!token) throw new Error('LiveAvatar session token: respuesta sin session_token')
    return { provider: 'liveavatar', sessionToken: token }
}
