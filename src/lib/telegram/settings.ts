/**
 * Carga de `avatar_telegram_settings` — un bot de Telegram por avatar.
 *
 * TRES funciones, cada una con un contrato distinto sobre `bot_token`:
 *
 *  - `loadTelegramSettings(avatarId)`: SIN sesión, para el webhook y los
 *    crones. Usa el cliente service-role (`orgSupabase`) filtrando por
 *    `avatar_id` — que es UNIQUE en esta tabla (migración de la Tarea 1), así
 *    que el filtro identifica una fila exacta sin necesitar una organizationId
 *    de entrada. El webhook, en concreto, sólo conoce el avatarId por la URL:
 *    la `organizationId` que haga falta después (p.ej. para registrar una
 *    venta) sale de la propia fila que esta función devuelve.
 *  - `loadTelegramSettingsForOrg(ctx, avatarId)`: CON contexto, vía `orgTable`
 *    (que ya inyecta el filtro `organization_id = ctx.organizationId`).
 *  - `loadTelegramBotToken(avatarId)`: el ÚNICO punto de acceso al token.
 *
 * Las dos primeras devuelven `TelegramSettings`, que NUNCA incluye `bot_token`
 * — ni seleccionando `*` se cuela: el único punto de conversión fila→DTO
 * (`toSettings`, más abajo) lo omite explícitamente, así que da igual qué
 * columnas traiga la consulta. Están pensadas para todo lo que pueda acabar
 * cerca de un componente de cliente (estado de conexión, info de webhook para
 * pantalla): la frontera que protegen es "hacia el cliente [de navegador]",
 * no "fuera del servidor" — el servidor sí necesita el token para invocar la
 * Bot API.
 *
 * Por eso existe `loadTelegramBotToken`: es EL sitio que sabe leer esa
 * columna — a propósito uno solo, no uno por cada llamador. La alternativa
 * (que cada consumidor que necesite el token — conectar el bot, mandar
 * contenido de pago...) haga su propia consulta puntual multiplicaría por N
 * las oportunidades de filtrarlo, justo donde la regla quiere lo contrario:
 * UN sitio que lee y maneja el token, no varios. Devuelve una cadena suelta,
 * no un objeto: así no puede colarse en un DTO por arrastre de propiedades
 * (`{...settings}`), y el nombre de la función avisa del peligro en el propio
 * call site. Quien la use: nunca pasar el resultado a un componente de
 * cliente, a un log, ni a un mensaje de error — la URL de la Bot API lleva el
 * token dentro (`@/lib/telegram/client` ya se encarga de no filtrarlo por ahí).
 *
 * Exenciones (candado F4.2 / `check:tenant`): este fichero usa `orgSupabase()`
 * crudo en las variantes sin sesión — motivo escrito en
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

/**
 * SÓLO SERVIDOR. Devuelve el token para poder llamar a la Bot API.
 *
 * Está separada de `loadTelegramSettings` a propósito, y devuelve una cadena
 * suelta en vez de un objeto: así el token no puede colarse en un DTO por
 * arrastre de propiedades, y el nombre de la función avisa de lo que hace.
 *
 * NUNCA lo pases a un componente de cliente, a un log ni a un mensaje de
 * error: la URL de Telegram lleva el token dentro, así que registrar una URL
 * fallida lo publica en claro.
 */
export async function loadTelegramBotToken(avatarId: string): Promise<string | null> {
    const { data, error } = await orgSupabase()
        .from('avatar_telegram_settings')
        .select('bot_token')
        .eq('avatar_id', avatarId)
        .maybeSingle()
    if (error) throw new Error(error.message)
    return data?.bot_token ?? null
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
