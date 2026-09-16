/**
 * Resolución de la API key de un perfil `social_profiles`.
 *
 * Vive fuera de SocialService.ts porque ese archivo es `'use server'`: todo
 * export de un archivo `'use server'` debe ser async (ni tsc ni eslint lo
 * detectan, solo el build — ver memoria use-server-exports-async.md), y
 * resolveProfileKey es intencionalmente síncrona.
 */

/**
 * Resolve which API key a profile row runs on. `null` means "fall back to env
 * UPLOAD_POST_API_KEY" — allowed ONLY while the row is active (the legacy
 * migrated row); a disconnected row without a key has no usable account.
 */
export function resolveProfileKey(row: { api_key: string | null; status: string }): string | null {
    if (row.api_key) return row.api_key
    if (row.status === 'active') return null
    throw new Error("This avatar's Upload-Post account is disconnected — reconnect it first")
}
