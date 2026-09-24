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
 * Simli fue el primero (barato, pero se ve 3D); Anam (Cara-4) es el que se
 * acerca a la calidad de las generaciones. Los dos aceptan exactamente el
 * mismo audio, así que cambiar de uno a otro es cambiar `face_provider`.
 *
 * PURO: tipos y constantes, sin imports. Lo importan servidor y cliente.
 */

export type FaceProvider = 'anam' | 'liveavatar' | 'simli'

export const FACE_PROVIDERS: FaceProvider[] = ['anam', 'liveavatar', 'simli']

export const FACE_PROVIDER_LABEL: Record<FaceProvider, string> = {
    anam: 'Anam (Cara)',
    liveavatar: 'LiveAvatar (HeyGen)',
    simli: 'Simli',
}

/** Dónde crea el usuario la cara y obtiene su id, por proveedor. */
export const FACE_PROVIDER_CONSOLE: Record<FaceProvider, string> = {
    anam: 'https://lab.anam.ai',
    liveavatar: 'https://app.liveavatar.com',
    simli: 'https://app.simli.com',
}

/** Lo que el navegador necesita para conectar. Sin API keys, sólo tokens de sesión. */
export type FaceClientConfig =
    | { provider: 'anam'; sessionToken: string }
    | { provider: 'simli'; sessionToken: string }
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
 * esta frecuencia para no remuestrear: LiveAvatar exige 24 kHz, los demás 16 kHz.
 */
export const FACE_AUDIO_SAMPLE_RATE: Record<FaceProvider, 16000 | 24000> = {
    anam: 16000,
    liveavatar: 24000,
    simli: 16000,
}

export function isFaceProvider(value: unknown): value is FaceProvider {
    return typeof value === 'string' && (FACE_PROVIDERS as string[]).includes(value)
}
