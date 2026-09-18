import { UploadPostProvider } from '@/lib/social/providers/UploadPostProvider'
import type { SocialProvider } from '@/lib/social/providers/SocialProvider'

export { deriveUploadPostUsername, isAppManagedUsername } from '@/lib/social/profileNaming'

/**
 * Cuenta AGENCIA de Upload-Post (SUPER-PLAN §4.0b, 2026-09-17): UNA sola API
 * key de la plataforma en env `UPLOAD_POST_API_KEY`; todos los perfiles
 * (sub-users) de todos los avatares cuelgan de ella y los tenants nunca la
 * ven. Antes cada avatar traía su propia key en `social_profiles.api_key`
 * (plan FREE por avatar) — esa columna ya no existe.
 *
 * Se memoiza por VALOR de la key y no como singleton a secas: si la key rota
 * en un redeploy, el proceso nuevo construye el cliente con la nueva sin
 * arrastrar el viejo.
 */
const cache = new Map<string, SocialProvider>()

function readAgencyKey(): string | null {
    const key = process.env.UPLOAD_POST_API_KEY?.trim()
    return key ? key : null
}

export function getSocialProvider(): SocialProvider {
    const key = readAgencyKey()
    if (!key) throw new Error('UPLOAD_POST_API_KEY is not configured')
    let provider = cache.get(key)
    if (!provider) {
        provider = new UploadPostProvider(key, process.env.UPLOAD_POST_BASE_URL)
        cache.set(key, provider)
    }
    return provider
}

/** ¿Hay key de agencia en el entorno? Server-only; alimenta la card de estado. */
export function hasUploadPostKey(): boolean {
    return readAgencyKey() !== null
}

/**
 * Últimos 4 caracteres de la key de agencia: la UI dice QUÉ key corre (p.ej.
 * para notar que Vercel sigue con la vieja) sin exponerla nunca entera.
 */
export function uploadPostKeyLast4(): string | null {
    const key = readAgencyKey()
    return key ? key.slice(-4) : null
}
