/**
 * Ajustes de "IA en comentarios" de un `social_profiles`, listos para el
 * sondeo y la entrega — sin `api_key` (esa sigue viviendo sólo en la fila
 * cruda, resuelta por `resolveProfileKey`; este DTO nunca la expone).
 *
 * `toSocialCommentSettings` es una función PURA (row → DTO): sólo importa un
 * TIPO de `@/lib/agent/db` (`import type`, se borra en compilación — no deja
 * ningún `require` en el JS emitido), para poder testearla sin Supabase
 * (regla de `global-constraints.md`: "pure files get tests, no mocks of
 * Supabase"). `@/lib/agent/db` importa a su vez `@/lib/supabase.ts`, que
 * construye un `SupabaseClient` en su ámbito de módulo (efecto secundario al
 * simple `import`, no sólo al invocar una función) y explota si
 * `NEXT_PUBLIC_SUPABASE_URL` no está en el proceso — como pasa al correr
 * `tsx --test` fuera de Next.js. Por eso `listPollableProfiles` —la única
 * función con IO de este fichero— importa `agentSupabase` de forma DINÁMICA
 * (`await import(...)`) en vez de al tope del fichero: así un test que sólo
 * quiere `toSocialCommentSettings` puede importar este módulo sin arrastrar
 * ese efecto secundario, sin partir el fichero en dos y sin cambiar nada del
 * comportamiento en producción (la carga dinámica se resuelve igual, sólo que
 * en el primer `await` en vez de al importar el módulo).
 *
 * @see docs/superpowers/specs — task-5-brief.md / global-constraints.md (comentarios-ia-social)
 */
import type { SocialProfileRow } from '@/lib/agent/db'

/** Cuenta propia del avatar en una red — de `social_profiles.connected_platforms`
 *  (ver `ConnectedAccount` en `@/@types/social.ts`). Sirve para descartar los
 *  comentarios que el propio avatar/creador dejó en su propio post. */
export interface SocialCommentOwnAccount {
    platform: string
    accountId: string
    accountName: string
}

export interface SocialCommentSettings {
    profileId: string
    avatarId: string
    organizationId: string
    uploadPostUsername: string
    aiRepliesEnabled: boolean
    aiDefaultChatMode: 'auto' | 'draft'
    dmEnabled: boolean
    dmText: string | null
    /** `social_profiles.ai_comment_dm_buttons` tal cual (jsonb libre) — quien
     *  arma el DM lo sanea con `sanitizeDmButtons` (dmEligibility.ts). */
    dmButtons: unknown
    ownAccounts: SocialCommentOwnAccount[]
}

/**
 * `social_profiles.connected_platforms` (jsonb libre) → cuentas propias
 * válidas. Igual que `sanitizeDmButtons`: lo que no calza se descarta en
 * silencio aquí — este fichero es puro y no loguea; quien necesite saber
 * cuántas entradas se descartaron ya tiene el `raw` para compararlo.
 */
function sanitizeOwnAccounts(raw: unknown): SocialCommentOwnAccount[] {
    if (!Array.isArray(raw)) return []
    const out: SocialCommentOwnAccount[] = []
    for (const item of raw) {
        if (!item || typeof item !== 'object') continue
        const rec = item as Record<string, unknown>
        const platform = rec.platform
        if (typeof platform !== 'string' || platform.trim() === '') continue
        const accountId = rec.accountId
        const accountName = rec.accountName
        out.push({
            platform,
            accountId: typeof accountId === 'string' ? accountId : '',
            accountName: typeof accountName === 'string' ? accountName : '',
        })
    }
    return out
}

/**
 * Row → DTO. Puro y total: nunca tira. `avatarId` vacío ('') es el caso
 * "no debería pasar" de una fila sin `avatar_id` — `listPollableProfiles`
 * filtra esas filas ANTES de llegar aquí (con warning), así que en la
 * práctica todo llamador de producción ve un `avatarId` no vacío.
 */
export function toSocialCommentSettings(row: SocialProfileRow): SocialCommentSettings {
    return {
        profileId: row.id,
        avatarId: row.avatar_id ?? '',
        organizationId: row.organization_id,
        uploadPostUsername: row.upload_post_username,
        aiRepliesEnabled: row.ai_comment_replies_enabled,
        aiDefaultChatMode: row.ai_comment_default_chat_mode === 'auto' ? 'auto' : 'draft',
        dmEnabled: row.ai_comment_dm_enabled,
        dmText: row.ai_comment_dm_text,
        dmButtons: row.ai_comment_dm_buttons,
        ownAccounts: sanitizeOwnAccounts(row.connected_platforms),
    }
}

export interface PollableProfile {
    /** Fila cruda — la necesita `resolveProfileKey` (api_key/status) y todo
     *  lo que hoy sólo sabe leer `SocialProfileRow` (p.ej. `syncPostTargets`,
     *  `pollProfileComments`). */
    row: SocialProfileRow
    settings: SocialCommentSettings
}

/**
 * Perfiles con la IA de comentarios encendida: `status='active' and
 * ai_comment_replies_enabled=true`. Session-less (lo llama el cron) — sin
 * `orgTable`, barre TODAS las orgs a propósito, igual que
 * `agent-inbox-poll`.
 */
export async function listPollableProfiles(): Promise<PollableProfile[]> {
    // Import dinámico a propósito — ver la nota de cabecera del fichero.
    const { agentSupabase } = await import('@/lib/agent/db')
    const supabase = agentSupabase()
    const { data, error } = await supabase
        .from('social_profiles')
        .select('*')
        .eq('status', 'active')
        .eq('ai_comment_replies_enabled', true)
    if (error) {
        console.error('[social-comments] no se pudieron listar los perfiles con IA de comentarios activa', error)
        return []
    }

    const out: PollableProfile[] = []
    for (const row of data ?? []) {
        // Invariante de la migración (social_profiles es 1:1 con avatar_id):
        // una fila con ai_comment_replies_enabled=true pero sin avatar_id es
        // un dato corrupto, no un caso normal. Se omite y se deja rastro en
        // vez de arrastrar un avatarId='' hasta resolveAvatarTargetById.
        if (!row.avatar_id) {
            console.warn(
                '[social-comments] social_profiles con ai_comment_replies_enabled=true pero sin avatar_id, se omite',
                { profileId: row.id },
            )
            continue
        }
        out.push({ row, settings: toSocialCommentSettings(row) })
    }
    return out
}
