/**
 * Carga de `avatar_telegram_settings` — un bot de Telegram por avatar.
 *
 * DOS variantes, mismo patrón que `src/lib/agent/inboxSync.ts`:
 *  - `loadTelegramSettings(avatarId)`: SIN sesión, para el webhook y los
 *    crones. Usa el cliente service-role (`orgSupabase`) filtrando por
 *    `avatar_id` — que es UNIQUE en esta tabla (migración de la Tarea 1), así
 *    que el filtro identifica una fila exacta sin necesitar una organizationId
 *    de entrada. El webhook, en concreto, sólo conoce el avatarId por la URL:
 *    la `organizationId` que haga falta después (p.ej. para registrar una
 *    venta) sale de la propia fila que esta función devuelve.
 *  - `loadTelegramSettingsForOrg(ctx, avatarId)`: CON contexto, vía `orgTable`
 *    (que ya inyecta el filtro `organization_id = ctx.organizationId`).
 *
 * `bot_token` NUNCA sale de aquí. Las dos variantes devuelven `TelegramSettings`,
 * que no tiene ese campo — ni seleccionando `*` se cuela: el único punto de
 * conversión fila→DTO (`toSettings`, más abajo) lo omite explícitamente, así
 * que da igual qué columnas traiga la consulta. Un llamador que de verdad
 * necesite las credenciales para invocar la Bot API (`@/lib/telegram/client`)
 * tiene que leer `bot_token` con su propia consulta puntual — a propósito:
 * que mover el token fuera de esta capa sea un acto explícito de quien lo
 * necesita, no un `return` que lo arrastra sin querer dentro de un objeto más
 * grande (p.ej. una server action que un componente cliente llama directo).
 *
 * Exenciones (candado F4.2 / `check:tenant`): este fichero usa `orgSupabase()`
 * crudo en la variante sin sesión — motivo escrito en
 * `scripts/check-tenant-access.mjs` y en el bloque `no-restricted-syntax` de
 * `eslint.config.mjs`.
 */
import { orgSupabase, orgTable } from '@/lib/org/orgTable'
import type { OrgContext } from '@/lib/tenant/getOrgContext'
import type { Database } from '@/@types/database.generated'

type TelegramSettingsRow = Database['public']['Tables']['avatar_telegram_settings']['Row']

/** Ajustes del bot de un avatar, SIN `bot_token`. Ver cabecera del fichero. */
export interface TelegramSettings {
    avatarId: string
    organizationId: string
    botId: number
    botUsername: string | null
    /** Comparar con la cabecera `X-Telegram-Bot-Api-Secret-Token` en el webhook. */
    webhookSecret: string
    enabled: boolean
    connectedAt: string
    disconnectedAt: string | null
    lastUpdateAt: string | null
    lastError: string | null
    createdAt: string
    updatedAt: string
}

/** Único punto fila→DTO. `bot_token` se omite aquí a propósito — no por lo que
 *  la consulta selecciona, sino por lo que esta función construye. */
function toSettings(row: TelegramSettingsRow): TelegramSettings {
    return {
        avatarId: row.avatar_id,
        organizationId: row.organization_id,
        botId: row.bot_id,
        botUsername: row.bot_username,
        webhookSecret: row.webhook_secret,
        enabled: row.enabled,
        connectedAt: row.connected_at,
        disconnectedAt: row.disconnected_at,
        lastUpdateAt: row.last_update_at,
        lastError: row.last_error,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }
}

/**
 * Variante SIN sesión (webhook, crones). `avatar_id` es UNIQUE en esta tabla,
 * así que basta para identificar la fila sin más contexto. Devuelve `null` si
 * el avatar no tiene bot conectado — NO es un error: p.ej. el webhook responde
 * 200 en silencio en ese caso.
 */
export async function loadTelegramSettings(avatarId: string): Promise<TelegramSettings | null> {
    const { data, error } = await orgSupabase()
        .from('avatar_telegram_settings')
        .select('*')
        .eq('avatar_id', avatarId)
        .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null
    return toSettings(data)
}

/** Variante CON contexto — `orgTable` ya inyecta `organization_id = ctx.organizationId`. */
export async function loadTelegramSettingsForOrg(
    ctx: OrgContext,
    avatarId: string,
): Promise<TelegramSettings | null> {
    const { data, error } = await orgTable(ctx, 'avatar_telegram_settings')
        .select('*')
        .eq('avatar_id', avatarId)
        .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null
    return toSettings(data)
}
