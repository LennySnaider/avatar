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

/** Lo que el validador necesita saber de la fila actual — el texto y el
 *  interruptor del DM, los dos únicos campos cuyo valor GUARDADO importa
 *  para validar el patch: el invariante "DM encendido ⇒ texto no vacío" se
 *  comprueba sobre el estado RESULTANTE (lo que trae el patch, heredando lo
 *  que no trae), no sólo sobre lo que el patch toca explícitamente — si no,
 *  un "Save DM" con textarea en blanco sobre un DM YA encendido (el patch ni
 *  siquiera menciona `aiCommentDmEnabled`) se colaba y dejaba
 *  `ai_comment_dm_enabled=true` + `ai_comment_dm_text=null`. */
export interface SocialCommentSettingsCurrent {
    aiCommentDmText: string | null
    aiCommentDmEnabled: boolean
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

    // El interruptor RESULTANTE: lo que trae el patch, o si el patch no lo
    // toca, lo que ya estaba guardado — un "Save DM" que sólo manda texto y
    // botones (el switch ya estaba encendido de antes) hereda `true` acá.
    const resolvedDmEnabled =
        patch.aiCommentDmEnabled !== undefined ? patch.aiCommentDmEnabled : current.aiCommentDmEnabled
    const dmTextIsEmpty = !resolvedDmText || resolvedDmText.trim() === ''

    if (resolvedDmEnabled && dmTextIsEmpty) {
        // Dos mensajes para el mismo invariante según qué generó el hueco:
        // encender el switch sin texto (el patch SÍ lo enciende) vs. vaciar
        // el texto mientras el switch ya estaba encendido de antes (el
        // patch no lo toca) — apagarlo explícitamente en el mismo patch
        // (`aiCommentDmEnabled:false`) nunca cae acá, porque entonces
        // `resolvedDmEnabled` ya es `false`.
        return {
            ok: false,
            error:
                patch.aiCommentDmEnabled === true
                    ? 'Write the DM text before enabling the private reply'
                    : 'Disable the private reply before removing the DM text',
        }
    }

    if (patch.aiCommentDmEnabled !== undefined) {
        update.ai_comment_dm_enabled = patch.aiCommentDmEnabled
    }

    return { ok: true, update }
}
