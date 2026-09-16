/**
 * Validación PURA del patch que guarda "IA en comentarios" por avatar
 * (Task 6). Vive separado de `SocialService.ts` (que tiene `'use server'` y
 * hace IO) para poder testearla sin Supabase — mismo criterio que
 * `dmEligibility.ts` / `settings.ts` en esta carpeta.
 *
 * A diferencia de `sanitizeDmButtons` (dmEligibility.ts), que DESCARTA en
 * silencio los botones inválidos porque arma lo que se manda al proveedor,
 * este validador RECHAZA el guardado completo con un error legible: quien
 * guarda ajustes debe enterarse de qué campo está mal, no perder datos sin
 * aviso.
 *
 * @see docs/superpowers/specs — task-6-brief.md / global-constraints.md (comentarios-ia-social)
 */

export interface SocialCommentDmButtonInput {
    title: string
    url: string
}

export interface SocialCommentSettingsPatch {
    aiCommentRepliesEnabled?: boolean
    aiCommentDefaultChatMode?: 'auto' | 'draft'
    aiCommentDmEnabled?: boolean
    aiCommentDmText?: string | null
    aiCommentDmButtons?: SocialCommentDmButtonInput[]
}

/** Lo que el validador necesita saber de la fila actual — sólo el texto del
 *  DM, que es el único campo cuyo valor guardado importa para validar OTRO
 *  campo del mismo patch (encender el DM sin texto, propio o heredado). */
export interface SocialCommentSettingsCurrent {
    aiCommentDmText: string | null
}

export interface SocialCommentSettingsUpdate {
    ai_comment_replies_enabled?: boolean
    ai_comment_default_chat_mode?: 'auto' | 'draft'
    ai_comment_dm_enabled?: boolean
    ai_comment_dm_text?: string | null
    ai_comment_dm_buttons?: SocialCommentDmButtonInput[]
}

export type ValidateSocialCommentSettingsResult =
    | { ok: true; update: SocialCommentSettingsUpdate }
    | { ok: false; error: string }

const MAX_DM_BUTTONS = 3
const MAX_BUTTON_TITLE_LENGTH = 20

/**
 * `patch` → columnas a actualizar en `social_profiles`, o el motivo por el
 * que se rechaza. Total y pura: nunca tira, sólo devuelve `ok:false`.
 */
export function validateSocialCommentSettingsPatch(
    patch: SocialCommentSettingsPatch,
    current: SocialCommentSettingsCurrent,
): ValidateSocialCommentSettingsResult {
    const update: SocialCommentSettingsUpdate = {}

    if (patch.aiCommentRepliesEnabled !== undefined) {
        update.ai_comment_replies_enabled = patch.aiCommentRepliesEnabled
    }

    if (patch.aiCommentDefaultChatMode !== undefined) {
        if (
            patch.aiCommentDefaultChatMode !== 'auto' &&
            patch.aiCommentDefaultChatMode !== 'draft'
        ) {
            return { ok: false, error: 'Invalid chat mode.' }
        }
        update.ai_comment_default_chat_mode = patch.aiCommentDefaultChatMode
    }

    if (patch.aiCommentDmButtons !== undefined) {
        if (patch.aiCommentDmButtons.length > MAX_DM_BUTTONS) {
            return { ok: false, error: 'You can add up to 3 buttons.' }
        }
        const cleanButtons: SocialCommentDmButtonInput[] = []
        for (let i = 0; i < patch.aiCommentDmButtons.length; i++) {
            const button = patch.aiCommentDmButtons[i]
            const title = typeof button?.title === 'string' ? button.title.trim() : ''
            const url = typeof button?.url === 'string' ? button.url.trim() : ''
            if (!title) {
                return { ok: false, error: `Button ${i + 1}: title is required.` }
            }
            if (title.length > MAX_BUTTON_TITLE_LENGTH) {
                return {
                    ok: false,
                    error: `Button ${i + 1}: title must be ${MAX_BUTTON_TITLE_LENGTH} characters or fewer.`,
                }
            }
            if (!/^https?:\/\//i.test(url)) {
                return { ok: false, error: `Button ${i + 1}: URL must start with http:// or https://.` }
            }
            cleanButtons.push({ title, url })
        }
        update.ai_comment_dm_buttons = cleanButtons
    }

    // El texto resuelto tras este patch (lo nuevo si viene, si no lo que ya
    // había guardado) es lo que decide si se puede encender el DM más abajo
    // — tanto si el switch viene en el MISMO patch como si el texto ya
    // estaba guardado de antes.
    let resolvedDmText = current.aiCommentDmText
    if (patch.aiCommentDmText !== undefined) {
        const trimmed = patch.aiCommentDmText === null ? null : patch.aiCommentDmText.trim()
        resolvedDmText = trimmed === '' ? null : trimmed
        update.ai_comment_dm_text = resolvedDmText
    }

    if (patch.aiCommentDmEnabled !== undefined) {
        if (patch.aiCommentDmEnabled && (!resolvedDmText || resolvedDmText.trim() === '')) {
            return { ok: false, error: 'Write the DM text before enabling the private reply' }
        }
        update.ai_comment_dm_enabled = patch.aiCommentDmEnabled
    }

    return { ok: true, update }
}
