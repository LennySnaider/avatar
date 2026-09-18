/**
 * Miniatura de un avatar a partir de sus referencias, SIN tocar Storage.
 *
 * Mismo orden de candidatos que `getAvatars.ts` y `AvatarCard.tsx` (cara →
 * angle → general, las más nuevas primero), pero sólo resuelve las que viven
 * en R2 con base pública configurada: es la URL directa e inmutable que ya
 * usa la tarjeta de "My Avatars". Las referencias que siguen en Supabase
 * Storage necesitarían una URL firmada (una llamada por avatar) y eso no lo
 * hace este helper a propósito — los dashboards lo llaman para N avatares en
 * un solo render y con las copias de Supabase ya drenadas (ver el cuarto
 * candado de eslint.config.mjs) casi nunca hace falta. Sin candidato → null y
 * la UI pinta iniciales.
 *
 * Puro: sin imports de base de datos, testeable con `tsx --test`.
 */
import { getReferenceMediaUrl } from '@/lib/storagePaths'

export interface ThumbnailCandidate {
    type: string
    storage_path: string | null
    storage_provider?: string | null
    created_at?: string | null
}

const PRIORITY = ['face', 'angle', 'general']

export function pickAvatarThumbnailUrl(
    refs: ThumbnailCandidate[] | null | undefined,
): string | null {
    if (!refs || refs.length === 0) return null
    if (!process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL) return null
    const byNewest = (a: ThumbnailCandidate, b: ThumbnailCandidate) =>
        (b.created_at ?? '').localeCompare(a.created_at ?? '')
    for (const type of PRIORITY) {
        const candidate = refs
            .filter(
                (r) =>
                    r.type === type &&
                    r.storage_provider === 'r2' &&
                    r.storage_path,
            )
            .sort(byNewest)[0]
        if (candidate?.storage_path)
            return getReferenceMediaUrl(candidate.storage_path, 'r2')
    }
    return null
}
