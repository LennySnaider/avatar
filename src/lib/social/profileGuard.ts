/**
 * Guarda PURA sobre una fila de `social_profiles`: ¿se puede operar contra
 * Upload-Post con este perfil? Sustituye a `resolveProfileKey` (borrado el
 * 2026-09-17 con el paso a cuenta agencia): ya no hay key por fila que
 * resolver, sólo el estado. Vive fuera de SocialService.ts porque ese archivo
 * es `'use server'` y todo export suyo debe ser async (ver memoria
 * use-server-exports-async.md).
 */

export const INACTIVE_PROFILE_MESSAGE =
    'This avatar has no active Upload-Post profile on the agency account — create or assign one first'

/** Lanza si el perfil no está `active` (legacy desconectado, o borrado en Upload-Post). */
export function assertActiveProfile(row: { status: string }): void {
    if (row.status !== 'active') throw new Error(INACTIVE_PROFILE_MESSAGE)
}
