'use server'

/**
 * Conectar y desconectar el bot de Telegram de un avatar.
 *
 * Todos los exports son async porque el fichero es `'use server'`: un export
 * síncrono aquí sólo revienta en el build, ni tsc ni eslint lo ven (verificar
 * con `grep -n "^export" src/services/AgentTelegramService.ts`).
 *
 * CUATRO CANDADOS de este fichero:
 *
 *  1. `connected_at` se conserva al reconectar. Es la fecha que factura la
 *     cuota prorrateada por días: reiniciarla regalaría los días ya
 *     consumidos. El mecanismo es el mismo que `setModuleStatus` usa para
 *     `installed_at` en ModulesService.ts: el upsert por `avatar_id` sólo pisa
 *     las columnas presentes en el objeto que se le pasa, así que
 *     `connected_at` simplemente NO se incluye en el payload de
 *     `connectTelegramBot` — sobrevive intacta si la fila ya existía, y el
 *     default `now()` de la columna la rellena si es la primera vez.
 *
 *  2. El token no vuelve a salir jamás. `loadTelegramSettingsForOrg` (y por
 *     tanto `toStatus` más abajo) nunca trae `bot_token` — ver settings.ts.
 *     Y si `getMe` falla por un token inválido, `TelegramApiError.message`
 *     nunca lo incluye (client.ts lo garantiza), así que propagarlo tal cual
 *     a través de `fail()` no lo filtra.
 *
 *  3. La propiedad del avatar se comprueba ANTES de nada, con el mismo patrón
 *     que `setAvatarFanvueCreator` en AgentInboxService.ts. Además —esto NO
 *     lo cubre el patrón de ese fichero, porque ahí no hay un accesor
 *     sin-sesión de por medio— `getTelegramWebhookInfo` pasa primero por
 *     `loadTelegramSettingsForOrg` (que sí filtra por `organization_id` vía
 *     `orgTable`) antes de pedir el token con `loadTelegramBotToken`, que por
 *     diseño (settings.ts: es la variante SIN sesión para el webhook y el
 *     cron) no filtra por organización. Sin ese paso previo, cualquier
 *     organización con el módulo instalado podría leer el webhook de OTRO
 *     avatar adivinando su uuid.
 *
 *  4. Desconectar es idempotente en la fecha de baja (ronda de revisión 1).
 *     `disconnected_at` cierra el periodo facturable, igual que `connected_at`
 *     lo abre — así que empujarla hacia adelante en una segunda llamada (doble
 *     clic, reintento de red, reenvío de la misma petición) cobraría días en
 *     los que el bot ya estaba apagado. `disconnectTelegramBot` por eso lee el
 *     estado ANTES de escribir: si ya estaba `enabled: false`, no vuelve a
 *     tocar la fecha — es un no-op exitoso, no un error, exactamente el mismo
 *     criterio que protege `connected_at` en el candado 1.
 *
 * ORDEN DE ESCRITURA EN `connectTelegramBot` (ronda de revisión 1): Telegram
 * mantiene UN SOLO webhook por token y lo sobrescribe incondicionalmente en
 * cuanto `setWebhook` responde 200 — no hay forma de "reservarlo" antes. Si el
 * mismo token se conecta a un segundo avatar, y `setWebhook` se llamara antes
 * de confirmar que la escritura local es válida, el bot del PRIMER avatar
 * quedaría mudo para siempre en el momento en que Telegram acepta el segundo
 * `setWebhook` — silencioso, sin error en ningún lado, aunque el upsert local
 * del segundo avatar SÍ falle después por el `unique(bot_id)`. Por eso el
 * orden real es: `getMe` (sólo lectura, no efecto colateral) → upsert local
 * con `enabled: false` (aquí revienta el choque de `bot_id` si lo hay, ANTES
 * de tocar Telegram) → `setWebhook` → sólo si eso tuvo éxito, un segundo
 * update que pone `enabled: true` y limpia `disconnected_at`. La fila nunca
 * dice "conectada" hasta que Telegram confirmó — así que un fallo de
 * `setWebhook` no necesita deshacer nada, porque nunca llegó a mentir.
 */
import { randomBytes } from 'node:crypto'
import { getOrgContext, type OrgContext } from '@/lib/tenant/getOrgContext'
import { orgTable, orgUpsert } from '@/lib/org/orgTable'
import { requireModule } from '@/lib/modules/entitlements'
import {
    loadTelegramBotToken,
    loadTelegramSettingsForOrg,
    type TelegramSettings,
} from '@/lib/telegram/settings'
import {
    deleteWebhook,
    getMe,
    getWebhookInfo,
    setWebhook,
    type TelegramWebhookInfo,
} from '@/lib/telegram/client'

export interface TelegramResult<T> {
    success: boolean
    data?: T
    error?: string
}

/** Vista de pantalla del bot de un avatar. Nunca el token — ver CANDADO 2. */
export interface TelegramBotStatus {
    /** `enabled && existe fila`: es lo que decide si la UI muestra el panel
     *  de "conectado" o el formulario para pegar un token. */
    connected: boolean
    botUsername: string | null
    enabled: boolean
    /** Fecha de conexión ORIGINAL — sobrevive a desconectar/reconectar (CANDADO 1). */
    connectedAt: string | null
}

const fail = (e: unknown): { success: false; error: string } => ({
    success: false,
    error: e instanceof Error ? e.message : String(e),
})

/**
 * Confirma que `avatarId` pertenece a la organización del contexto. Mismo
 * patrón que `setAvatarFanvueCreator` (AgentInboxService.ts): el filtro real
 * es el `.eq('organization_id', ctx.organizationId)` que `orgTable` ya
 * inyecta; esta consulta sólo lo hace explícito y da un error legible en vez
 * de dejar que un upsert silencioso escriba a nombre de otra organización.
 */
async function assertOwnedAvatar(ctx: OrgContext, avatarId: string): Promise<void> {
    const { data: avatar, error } = await orgTable(ctx, 'avatars')
        .select('id')
        .eq('id', avatarId)
        .maybeSingle()
    if (error) throw new Error(error.message)
    if (!avatar) throw new Error('Avatar no encontrado en tu organización.')
}

/** Único punto fila-de-ajustes → estado de pantalla. */
function toStatus(settings: TelegramSettings | null): TelegramBotStatus {
    if (!settings) {
        return { connected: false, botUsername: null, enabled: false, connectedAt: null }
    }
    return {
        connected: settings.enabled,
        botUsername: settings.botUsername,
        enabled: settings.enabled,
        connectedAt: settings.connectedAt,
    }
}

/**
 * Conecta (o reconecta) el bot de un avatar: valida el token contra la Bot
 * API, persiste los ajustes y sólo ENTONCES registra el webhook. Ver CANDADO 1
 * sobre por qué `connected_at` no se toca aquí, y la nota "ORDEN DE ESCRITURA"
 * en la cabecera del fichero sobre por qué el upsert local va ANTES que
 * `setWebhook` y por qué `enabled` se activa en una segunda escritura, no en
 * la primera.
 */
export async function connectTelegramBot(
    avatarId: string,
    botToken: string,
): Promise<TelegramResult<TelegramBotStatus>> {
    try {
        const ctx = await getOrgContext()
        await requireModule(ctx, 'telegram')

        if (!avatarId) return { success: false, error: 'Falta el avatar.' }
        const token = botToken.trim()
        if (!token) return { success: false, error: 'Falta el token del bot.' }

        // CANDADO 3 — antes de gastar una llamada a Telegram o tocar la base.
        await assertOwnedAvatar(ctx, avatarId)

        // getMe valida el token Y trae bot_id (unique en la tabla) + username.
        // Es de sólo lectura — no tiene el problema de orden de setWebhook.
        const me = await getMe(token)
        const webhookSecret = randomBytes(32).toString('hex')

        // FASE 1 — escritura LOCAL primero, con `enabled: false` a propósito.
        // Si `bot_id` ya pertenece a otro avatar, el choque revienta AQUÍ,
        // antes de que Telegram se entere de que existimos: su webhook sigue
        // apuntando a quien ya lo tenía.
        const { error } = await orgUpsert(
            ctx,
            'avatar_telegram_settings',
            {
                avatar_id: avatarId,
                bot_id: me.id,
                bot_username: me.username ?? null,
                bot_token: token,
                webhook_secret: webhookSecret,
                enabled: false,
                updated_at: new Date().toISOString(),
                // connected_at OMITIDO A PROPÓSITO (CANDADO 1) y
                // disconnected_at TAMBIÉN OMITIDO: si esto es una reconexión
                // tras una baja, su fecha sobrevive intacta mientras
                // `enabled` siga en `false` — coherente con el CANDADO 4, no
                // queda una fila "no habilitada" con fecha de baja en blanco.
            },
            { onConflict: 'avatar_id' },
        )
        if (error) {
            // `bot_id` también es UNIQUE (un bot pertenece a un solo avatar).
            // El conflicto declarado arriba es `avatar_id`, así que un choque
            // en `bot_id` no lo resuelve el upsert: es la ÚNICA otra
            // constraint unique de esta tabla, y llega aquí como violación
            // cruda de Postgres (23505) en vez de como fila actualizada.
            if (error.code === '23505') {
                throw new Error(
                    'Ese bot ya está conectado a otro avatar. Desconéctalo de ahí primero o usa un bot distinto.',
                )
            }
            throw new Error(error.message)
        }

        // FASE 2 — sólo ahora se toca Telegram. Si esto falla (red, Telegram
        // caído, URL rechazada), la fila QUEDA en `enabled: false`: nunca
        // llegó a decir "conectada", así que no hay nada que deshacer — el
        // error simplemente se propaga tal cual a través de `fail()`.
        const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3030'
        await setWebhook(token, {
            url: `${base}/api/webhooks/telegram/${avatarId}`,
            secretToken: webhookSecret,
        })

        // FASE 3 — Telegram confirmó: ahora sí se marca activa y se limpia la
        // fecha de baja (si la había). Único punto de todo el fichero donde
        // `enabled` pasa a `true`.
        const { error: activateError } = await orgTable(ctx, 'avatar_telegram_settings')
            .update({ enabled: true, disconnected_at: null, updated_at: new Date().toISOString() })
            .eq('avatar_id', avatarId)
        if (activateError) throw new Error(activateError.message)

        const settings = await loadTelegramSettingsForOrg(ctx, avatarId)
        return { success: true, data: toStatus(settings) }
    } catch (e) {
        return fail(e)
    }
}

/**
 * Desconecta el bot de un avatar: lo marca deshabilitado y best-effort le
 * pide a Telegram que deje de entregar updates. La fila NO se borra —
 * `connected_at` queda intacta para si se reconecta (CANDADO 1) — y
 * `bot_token` no se puede limpiar aunque quisiéramos: la columna es
 * `NOT NULL` en el esquema (Tarea 1).
 */
export async function disconnectTelegramBot(avatarId: string): Promise<TelegramResult<TelegramBotStatus>> {
    try {
        const ctx = await getOrgContext()
        await requireModule(ctx, 'telegram')
        if (!avatarId) return { success: false, error: 'Falta el avatar.' }

        await assertOwnedAvatar(ctx, avatarId)

        const settings = await loadTelegramSettingsForOrg(ctx, avatarId)
        if (!settings) {
            return { success: false, error: 'Este avatar no tiene un bot de Telegram conectado.' }
        }

        // CANDADO 4 — idempotencia de `disconnected_at`. Ver cabecera del
        // fichero: esa fecha cierra el periodo facturable, así que un doble
        // clic / reintento / reenvío sobre un avatar YA desconectado no debe
        // reescribirla. Éxito silencioso, no error: desconectar algo que ya
        // está desconectado no es una operación inválida.
        if (!settings.enabled) {
            return { success: true, data: toStatus(settings) }
        }

        const { error } = await orgTable(ctx, 'avatar_telegram_settings')
            .update({
                enabled: false,
                disconnected_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('avatar_id', avatarId)
        if (error) throw new Error(error.message)

        // Mejor esfuerzo ante Telegram: si esto falla, el bot igual queda
        // desconectado (ya está `enabled=false` en la base, y el webhook de
        // la Tarea 4 responde 200 en silencio para una fila deshabilitada).
        // Lo único que se pierde es que Telegram siga reintentando entregas a
        // un endpoint que ya no las procesa — molesto, no roto.
        try {
            const token = await loadTelegramBotToken(avatarId)
            if (token) await deleteWebhook(token)
        } catch (e) {
            console.warn('[AgentTelegramService] deleteWebhook falló al desconectar (no fatal):', e)
        }

        const updated = await loadTelegramSettingsForOrg(ctx, avatarId)
        return { success: true, data: toStatus(updated) }
    } catch (e) {
        return fail(e)
    }
}

/** Estado para pantalla. Nunca el token — ver CANDADO 2. */
export async function getTelegramStatus(avatarId: string): Promise<TelegramResult<TelegramBotStatus>> {
    try {
        const ctx = await getOrgContext()
        await requireModule(ctx, 'telegram')
        const settings = await loadTelegramSettingsForOrg(ctx, avatarId)
        return { success: true, data: toStatus(settings) }
    } catch (e) {
        return fail(e)
    }
}

/**
 * Info del webhook registrado en Telegram (para mostrar salud de la
 * integración). Ver CANDADO 3: pasa primero por `loadTelegramSettingsForOrg`
 * — que sí filtra por organización — antes de pedir el token con
 * `loadTelegramBotToken`, que por diseño no lo filtra.
 */
export async function getTelegramWebhookInfo(
    avatarId: string,
): Promise<TelegramResult<TelegramWebhookInfo | null>> {
    try {
        const ctx = await getOrgContext()
        await requireModule(ctx, 'telegram')

        const settings = await loadTelegramSettingsForOrg(ctx, avatarId)
        if (!settings) return { success: true, data: null }

        const token = await loadTelegramBotToken(avatarId)
        if (!token) return { success: true, data: null }

        const info = await getWebhookInfo(token)
        return { success: true, data: info }
    } catch (e) {
        return fail(e)
    }
}
