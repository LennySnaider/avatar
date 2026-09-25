/**
 * Contrato del PROVEEDOR DE CARA en tiempo real — la pieza intercambiable
 * del módulo en vivo. Todo proveedor que encaje aquí funciona igual:
 *
 *  - En el servidor, `mintFaceSession` cambia la API key (que nunca sale de
 *    Vercel) por credenciales temporales de UNA sesión.
 *  - En el navegador, el adaptador de `useLiveCall` recibe ese
 *    `FaceClientConfig`, abre la conexión WebRTC y le empuja el audio PCM16
 *    16 kHz mono que sintetiza MiniMax; el proveedor devuelve el video con
 *    los labios sincronizados.
 *
 * Simli se probó y se descartó: se ve 3D y su SDK no compila en Linux
 * (importa './Client' pero el fichero es client.js). Anam y LiveAvatar
 * aceptan el mismo audio PCM, así que cambiar de uno a otro es cambiar
 * `face_provider`.
 *
 * PURO: tipos y constantes, sin imports. Lo importan servidor y cliente.
 */

export type FaceProvider = 'anam' | 'liveavatar'

export const FACE_PROVIDERS: FaceProvider[] = ['liveavatar', 'anam']

export const FACE_PROVIDER_LABEL: Record<FaceProvider, string> = {
    anam: 'Anam (Cara)',
    liveavatar: 'LiveAvatar (HeyGen)',
}

/** Dónde crea el usuario la cara y obtiene su id, por proveedor. */
export const FACE_PROVIDER_CONSOLE: Record<FaceProvider, string> = {
    anam: 'https://lab.anam.ai',
    liveavatar: 'https://app.liveavatar.com',
}

/** Lo que el navegador necesita para conectar. Sin API keys, sólo tokens de sesión. */
export type FaceClientConfig =
    | { provider: 'anam'; sessionToken: string }
    | { provider: 'liveavatar'; sessionToken: string }

export interface MintFaceSessionInput {
    provider: FaceProvider
    faceId: string
    /** Tope absoluto de la sesión en el proveedor, en segundos. */
    maxSessionSeconds: number
    /** Sin audio durante esto, el proveedor corta por su cuenta. */
    maxIdleSeconds: number
}

/**
 * Frecuencia del PCM16 mono que espera cada proveedor. El TTS se pide ya a
 * esta frecuencia para no remuestrear: LiveAvatar exige 24 kHz, Anam 16 kHz.
 */
export const FACE_AUDIO_SAMPLE_RATE: Record<FaceProvider, 16000 | 24000> = {
    anam: 16000,
    liveavatar: 24000,
}

export function isFaceProvider(value: unknown): value is FaceProvider {
    return typeof value === 'string' && (FACE_PROVIDERS as string[]).includes(value)
}
