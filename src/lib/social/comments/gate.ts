/**
 * ¿Un comentario entrante de una red social merece que la IA redacte una
 * respuesta pública?
 *
 * Fichero PURO, sin imports, calcado de `src/lib/telegram/aiGate.ts` — el
 * gate de Telegram — pero con las condiciones propias de comentarios: el
 * interruptor es `social_profiles.ai_comment_*` (independiente de
 * `avatar_personas.enabled`, igual que Telegram lo es de Fanvue) y además
 * hay que descartar los comentarios que puso el propio avatar/creador
 * (isOwnComment) para no entrar en loop contestándose a sí mismo.
 */
export interface CommentDraftGateInput {
    /** `social_profiles.ai_comment_replies_enabled` (el flag de la red
     *  concreta del post, no el de la persona). */
    aiRepliesEnabled: boolean
    /** `ingestComment(...).inserted`: false = ya lo habíamos visto (reintento
     *  de una ronda de polling o comentario duplicado). No se genera un
     *  segundo borrador. */
    inserted: boolean
    /** El comentario lo escribió el propio avatar/creador (o llegó marcado
     *  como eco de una respuesta que ya enviamos) — no se le contesta a
     *  uno mismo. */
    isOwnComment: boolean
    /** `agent_chats.mode`: 'off' | 'draft' | 'auto'. */
    chatMode: string
    /** Texto del comentario. Sin texto no hay a qué responder. */
    text: string | null
}

export function shouldDraftCommentReply(input: CommentDraftGateInput): boolean {
    if (!input.aiRepliesEnabled) return false
    if (!input.inserted) return false
    if (input.isOwnComment) return false
    if (input.chatMode === 'off') return false
    if (!input.text || input.text.trim() === '') return false
    return true
}
