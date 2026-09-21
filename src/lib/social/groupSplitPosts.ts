/**
 * Junta en una sola tarjeta las filas de un post que se publicó en varias
 * llamadas.
 *
 * Pasa cuando hay música de por medio: TikTok recibe el MP4 limpio con su
 * pista nativa y el resto el MP4 con la música horneada, y como Upload-Post
 * manda un archivo por llamada, salen dos filas de `social_posts` unidas por
 * `post_group_id`. Para el usuario fue UN post.
 *
 * El estado del grupo es deliberadamente pesimista: si una de las llamadas
 * falló, la tarjeta NO dice "published". Esa mentira por plataforma es justo
 * la razón por la que existe `social_post_targets`.
 */

export interface SplitPostRow {
    id: string
    post_group_id?: string | null
    platforms: unknown
    status: string
}

/** De peor a mejor: el grupo se queda con el peor estado de sus filas. */
const STATUS_RANK: Record<string, number> = {
    failed: 0,
    processing: 1,
    scheduled: 2,
    published: 3,
}

const rank = (status: string): number => STATUS_RANK[status] ?? 1

const asList = (platforms: unknown): unknown[] =>
    Array.isArray(platforms) ? platforms : []

const keyOf = (platform: unknown): string =>
    typeof platform === 'string'
        ? platform
        : JSON.stringify(platform ?? null)

export function groupSplitPosts<T extends SplitPostRow>(rows: T[]): T[] {
    const out: T[] = []
    // group_id → índice en `out`, para que el grupo se quede en el sitio de su
    // primera fila en vez de saltar al final y descolocar el orden por fecha.
    const seen = new Map<string, number>()

    for (const current of rows) {
        const groupId = current.post_group_id
        if (!groupId) {
            out.push(current)
            continue
        }

        const at = seen.get(groupId)
        if (at === undefined) {
            seen.set(groupId, out.length)
            out.push({ ...current })
            continue
        }

        const merged = out[at]
        const platforms = [...asList(merged.platforms)]
        const already = new Set(platforms.map(keyOf))
        for (const platform of asList(current.platforms)) {
            if (already.has(keyOf(platform))) continue
            already.add(keyOf(platform))
            platforms.push(platform)
        }

        out[at] = {
            ...merged,
            platforms,
            status: rank(current.status) < rank(merged.status) ? current.status : merged.status,
        }
    }

    return out
}
