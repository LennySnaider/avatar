/**
 * ¿Un mensaje entrante de Telegram merece que la IA genere un borrador?
 *
 * Fichero PURO, sin imports, para que el test corra sin entorno. La regla
 * vive aquí y sólo aquí; el webhook la llama con los datos ya cargados.
 *
 * Es el gate del canal (spec A3-bis): NO mira `avatar_personas.enabled`,
 * que es el interruptor de Fanvue. Lo que enciende la IA en Telegram es
 * `avatar_telegram_settings.ai_replies_enabled`.
 */
export interface TelegramDraftGateInput {
    /** `avatar_telegram_settings.ai_replies_enabled`. */
    aiRepliesEnabled: boolean
    /** `agent_chats.mode`: 'off' | 'draft' | 'auto'. */
    chatMode: string
    /** `agent_chats.is_creator`: el interlocutor es otro creador o un bot. */
    isCreator: boolean
    /** Texto del mensaje (o caption). Sin texto se ingiere pero no se
     *  draftea: la IA no tiene a qué responder. `/start` SÍ es texto: es el
     *  fan abriendo la conversación, y el prompt sabe saludar. */
    text: string | null
    /** `ingestMessage(...).inserted`: false = ya lo habíamos visto (reintento
     *  de Telegram o duplicado). No se genera un segundo borrador. */
    inserted: boolean
}

export function shouldDraftTelegramReply(input: TelegramDraftGateInput): boolean {
    if (!input.aiRepliesEnabled) return false
    if (!input.inserted) return false
    if (input.isCreator) return false
    if (input.chatMode === 'off') return false
    if (!input.text || input.text.trim() === '') return false
    return true
}
