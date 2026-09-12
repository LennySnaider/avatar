/**
 * Carga de `avatar_telegram_settings` — un bot de Telegram por avatar.
 *
 * CUATRO funciones. DOS secretos, cada uno con SU PROPIO punto de acceso
 * estrecho, y dos DTOs "seguros cerca del cliente [de navegador]" que los
 * excluyen a los dos:
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
 *  - `loadTelegramBotToken(avatarId)`: el ÚNICO punto de acceso al token del bot.
 *  - `loadTelegramWebhookSecret(avatarId)`: el ÚNICO punto de acceso al secreto del webhook.
 *
 * Las dos primeras devuelven `TelegramSettings`, que NUNCA incluye `bot_token`
 * NI `webhook_secret` — ni seleccionando `*` se cuela: el único punto de
 * conversión fila→DTO (`toSettings`, más abajo) los omite explícitamente, así
 * que da igual qué columnas traiga la consulta. `TelegramSettings` sólo lleva
 * lo que de verdad es seguro cerca de un componente de cliente: si está
 * conectado, el nombre del bot, si está habilitado, las fechas y el
 * diagnóstico (`lastError`).
 *
 * Por qué el secreto del webhook corre la MISMA regla que el token, aunque no
 * hable con ningún proveedor externo: no protege datos, protege el DERECHO A
 * DECIRLE A NUESTRO SISTEMA QUE ALGO OCURRIÓ. El webhook de la Tarea 4 lo
 * compara contra la cabecera `X-Telegram-Bot-Api-Secret-Token` para decidir
 * si un `purchased_paid_media` es legítimo; quien conociera este secreto
 * podría fabricar un evento de compra falso y nuestro código asentaría una
 * comisión real contra el monedero de la organización a partir de una venta
 * que nunca existió. Es un vector para FABRICAR movimientos contables, no
 * para leerlos — por eso un solo lector, nunca en un DTO, igual que el token.
 *
 * `loadTelegramBotToken`/`loadTelegramWebhookSecret` son EL sitio que sabe
 * leer cada columna — a propósito uno solo por secreto, no uno por cada
 * llamador. La alternativa (que cada consumidor que necesite un secreto —
 * conectar el bot, mandar contenido de pago, validar el webhook...) haga su
 * propia consulta puntual multiplicaría por N las oportunidades de
 * filtrarlo, justo donde la regla quiere lo contrario: UN sitio que lee y
 * maneja cada secreto, no varios. Las dos funciones devuelven una cadena
 * suelta, no un objeto: así el secreto no puede colarse en un DTO por
 * arrastre de propiedades (`{...settings}`), y el nombre de la función avisa
 * del peligro en el propio call site. Quien las use: nunca pasar el
 * resultado a un componente de cliente, a un log, ni a un mensaje de error —
 * la URL de la Bot API lleva el token dentro (`@/lib/telegram/client` ya se
 * encarga de no filtrarlo por ahí).
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

/** Ajustes del bot de un avatar, SIN `bot_token` NI `webhook_secret`. Ver
 *  cabecera del fichero. */
export interface TelegramSettings {
    avatarId: string
    organizationId: string
    botId: number
    botUsername: string | null
    enabled: boolean
    connectedAt: string
    disconnectedAt: string | null
    lastUpdateAt: string | null
    lastError: string | null
    createdAt: string
    updatedAt: string
}

/** Único punto fila→DTO. `bot_token` y `webhook_secret` se omiten aquí a
 *  propósito — no por lo que la consulta selecciona, sino por lo que esta
 *  función construye. */
function toSettings(row: TelegramSettingsRow): TelegramSettings {
    return {
        avatarId: row.avatar_id,
        organizationId: row.organization_id,
        botId: row.bot_id,
        botUsername: row.bot_username,
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

/**
 * SÓLO SERVIDOR. Devuelve el secreto para comparar contra la cabecera
 * `X-Telegram-Bot-Api-Secret-Token` que Telegram manda en cada petición al
 * webhook.
 *
 * Mismo trato que `loadTelegramBotToken` y por la misma razón de fondo: este
 * secreto no protege datos, protege el derecho a decirle a nuestro sistema
 * que algo ocurrió — quien lo tenga puede fabricar un evento de compra falso.
 * Un solo lector, cadena suelta (no un objeto), nunca hacia un componente de
 * cliente ni a un log ni a un mensaje de error.
 */
export async function loadTelegramWebhookSecret(avatarId: string): Promise<string | null> {
    const { data, error } = await orgSupabase()
        .from('avatar_telegram_settings')
        .select('webhook_secret')
        .eq('avatar_id', avatarId)
        .maybeSingle()
    if (error) throw new Error(error.message)
    return data?.webhook_secret ?? null
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
