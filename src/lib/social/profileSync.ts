/**
 * Planificador PURO del sync "Refresh profiles" (cuenta agencia de
 * Upload-Post): cruza las filas `social_profiles` de la org con los perfiles
 * que devuelve `GET /api/uploadposts/users` y dice qué hacer con cada uno.
 * La IO (updates/upserts) vive en `SocialService.syncUploadPostProfiles`;
 * aquí sólo la decisión, para poder testearla sin Supabase.
 *
 * Reglas:
 *  - username en ambos lados → `activate` (refrescar snapshot, status active).
 *  - upstream que la org no tiene → `insert` como perfil LIBRE (avatar_id
 *    null). Si otra org ya lo reclamó (username único global) el upsert con
 *    `ignoreDuplicates` lo salta; eso no se decide aquí.
 *  - fila `active` de la org que ya no está upstream → `disconnect`. Una fila
 *    ya `disconnected` no se toca (las 6 legacy siguen tal cual).
 *  - NUNCA se propone borrar nada upstream: la cuenta la comparten otros
 *    proyectos.
 */

export interface SyncableProfileRow {
    id: string
    upload_post_username: string
    status: string
}

export interface UpstreamProfile {
    username: string
}

export interface ProfileSyncPlan<U extends UpstreamProfile> {
    activate: { id: string; details: U }[]
    insert: U[]
    disconnect: string[]
}

export function planProfileSync<U extends UpstreamProfile>(
    orgRows: SyncableProfileRow[],
    upstream: U[],
): ProfileSyncPlan<U> {
    const byUsername = new Map(orgRows.map((row) => [row.upload_post_username, row]))
    const upstreamNames = new Set(upstream.map((profile) => profile.username))

    const activate: { id: string; details: U }[] = []
    const insert: U[] = []
    for (const profile of upstream) {
        const row = byUsername.get(profile.username)
        if (row) activate.push({ id: row.id, details: profile })
        else insert.push(profile)
    }

    const disconnect = orgRows
        .filter((row) => row.status === 'active' && !upstreamNames.has(row.upload_post_username))
        .map((row) => row.id)

    return { activate, insert, disconnect }
}
