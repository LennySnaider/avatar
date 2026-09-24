/**
 * Despacho por proveedor (ver `./types.ts`). `switch` exhaustivo con guarda
 * `never`: un proveedor nuevo en `FaceProvider` que no tenga adaptador deja
 * de compilar en vez de fallar en producción.
 */
import type { FaceClientConfig, FaceProvider, MintFaceSessionInput } from './types'
import { mintAnamSession } from './anam'
import { mintSimliSession } from './simli'
import { mintLiveAvatarSession } from './liveavatar'

export async function mintFaceSession(input: MintFaceSessionInput): Promise<FaceClientConfig> {
    const provider: FaceProvider = input.provider
    switch (provider) {
        case 'anam':
            return mintAnamSession(input)
        case 'simli':
            return mintSimliSession(input)
        case 'liveavatar':
            return mintLiveAvatarSession(input)
        default: {
            const exhaustive: never = provider
            throw new Error(`Proveedor de cara sin adaptador: ${exhaustive}`)
        }
    }
}

/** ¿Está configurada la API key del proveedor en este entorno? */
export function isFaceProviderConfigured(provider: FaceProvider): boolean {
    switch (provider) {
        case 'anam':
            return Boolean(process.env.ANAM_API_KEY)
        case 'simli':
            return Boolean(process.env.SIMLI_API_KEY)
        case 'liveavatar':
            return Boolean(process.env.LIVEAVATAR_API_KEY)
        default: {
            const exhaustive: never = provider
            throw new Error(`Proveedor de cara desconocido: ${exhaustive}`)
        }
    }
}

export type { FaceClientConfig, FaceProvider, MintFaceSessionInput } from './types'
