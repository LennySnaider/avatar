/**
 * Tipos planos y serializables compartidos entre `[slug]/page.tsx` (servidor)
 * y sus componentes de cliente — ninguno lleva un secreto (token del bot,
 * secreto de webhook): esos nunca salen de `AgentTelegramService.ts` /
 * `@/lib/telegram/settings` (ver CANDADO 2 de ese fichero).
 */

/** Generación del avatar, ya resuelta a URL pública — para el selector de
 *  "Añadir desde generaciones" (Step 3). Mismas tres columnas que
 *  `ComposerGeneration` en fanvue/composer/page.tsx, mismo criterio: sólo lo
 *  que el grid necesita pintar, no la fila cruda de `generations`. */
export interface GenerationPickerItem {
    id: string
    mediaType: 'IMAGE' | 'VIDEO'
    mediaUrl: string
    prompt: string
}

/** Conversación de Telegram de este avatar (Step 4) — `agent_chats` filtrada
 *  por `avatar_id` y `platform = 'telegram'` en `[slug]/page.tsx`: esa tabla
 *  es compartida con Fanvue, así que el filtro de plataforma no es opcional. */
export interface TelegramChatListItem {
    id: string
    fanDisplayName: string | null
    fanHandle: string | null
    fanAvatarUrl: string | null
    lastMessageAt: string | null
    lastFanMessageAt: string | null
    unreadCount: number
}

/**
 * Fila de la tabla de ventas recientes (Step 5). `commissionSettled` separa
 * "todavía no se asentó" de "se asentó en 0 tokens" — mismo criterio que el
 * CANDADO de `recordStarsSale` en sales.ts: no son lo mismo, y confundirlos
 * mostraría una comisión de más o de menos que en realidad está pendiente.
 */
export interface TelegramSaleRow {
    id: string
    /** Título del ítem en el momento de la venta, o `null` si el ítem del
     *  catálogo ya se borró (`item_id` cae a NULL — on delete set null). */
    itemTitle: string | null
    stars: number
    /** 'offered' | 'purchased' — los dos valores que este canal escribe hoy
     *  (ver paidMedia.ts / el webhook). Cualquier otro se pinta tal cual. */
    status: string
    commissionSettled: boolean
    commissionPct: number | null
    commissionTokens: number | null
    offeredAt: string
    purchasedAt: string | null
}
