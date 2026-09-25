/**
 * Anam (https://anam.ai) — cara en tiempo real desde una sola foto, modelo
 * Cara. Modo "audio passthrough": Anam NO corre STT/LLM/TTS, sólo anima la
 * cara con el audio que le mandamos, así la voz sigue siendo la clonada en
 * MiniMax y la persona sigue siendo la del agente.
 *
 * SÓLO SERVIDOR: usa ANAM_API_KEY. El token que devuelve es de una sesión y
 * es lo único que viaja al navegador (`@anam-ai/js-sdk` → `createClient`).
 */
import type { FaceClientConfig, MintFaceSessionInput } from './types'

const ANAM_API_BASE = 'https://api.anam.ai/v1'

function apiKey(): string {
    const key = process.env.ANAM_API_KEY
    if (!key) throw new Error('ANAM_API_KEY is not defined')
    return key
}

export async function mintAnamSession(input: MintFaceSessionInput): Promise<FaceClientConfig> {
    // `avatarModel` es opcional a propósito: Cara 4 está en acceso anticipado
    // por organización. Sin la variable, Anam usa el modelo por defecto de la
    // cuenta y la sesión no falla por pedir un modelo que no está habilitado.
    const avatarModel = process.env.ANAM_AVATAR_MODEL?.trim() || undefined
    const res = await fetch(`${ANAM_API_BASE}/auth/session-token`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey()}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            clientLabel: 'avatarlab-live',
            // Modo passthrough: sólo `avatarId` + `enableAudioPassthrough`
            // (+ modelo opcional). Anam no corre STT/LLM/TTS: la duración de
            // la sesión la acota nuestro propio heartbeat y `maxSessionSeconds`
            // en el servidor (el token de Anam caduca en 1 h de todos modos).
            personaConfig: {
                avatarId: input.faceId,
                ...(avatarModel ? { avatarModel } : {}),
                enableAudioPassthrough: true,
            },
        }),
    })
    const raw = await res.text()
    if (!res.ok) {
        throw new Error(`Anam session token failed (${res.status}): ${raw.slice(0, 300)}`)
    }
    let json: { sessionToken?: string }
    try {
        json = JSON.parse(raw) as { sessionToken?: string }
    } catch {
        throw new Error('Anam session token: respuesta no es JSON')
    }
    if (!json.sessionToken) throw new Error('Anam session token: respuesta sin sessionToken')
    return { provider: 'anam', sessionToken: json.sessionToken }
}
