'use server'

/**
 * Conectar y desconectar el bot de Telegram de un avatar, la galería de
 * contenido de pago (Task 5: `listPaidMediaItems`/`upsertPaidMediaItem`/
 * `deletePaidMediaItem`) y su envío a una conversación
 * (`sendPaidMediaFromInbox`, que delega en `deliverPaidMedia` de
 * `@/lib/telegram/paidMedia` — ahí vive el orden obligatorio de la entrega y
 * el porqué).
 *
 * Todos los exports son async porque el fichero es `'use server'`: un export
 * síncrono aquí sólo revienta en el build, ni tsc ni eslint lo ven (verificar
 * con `grep -n "^export" src/services/AgentTelegramService.ts`).
 *
 * CUATRO CANDADOS de este fichero (del connect/disconnect original — la
 * galería y el envío añaden los suyos propios en su propio docblock, no
 * renumerados aquí para no mezclar los dos grupos):
 *
 *  1. `connected_at` se conserva al reconectar Y arranca en NULL, no en la
 *     fecha del primer intento. Es la fecha que factura la cuota prorrateada
 *     por días, así que dos cosas tienen que ser ciertas a la vez: que
 *     reconectar no la reinicie (regalaría los días ya consumidos) y que no
 *     se ancle a un intento que todavía no sabemos si funcionó. Hasta la
 *     migración `avatar_telegram_connected_at_nullable` la columna era
 *     `not null default now()`, así que ese default la estampaba en la
 *     PRIMERA escritura (FASE 1 más abajo, `enabled: false`, antes de que
 *     Telegram confirme nada); si `setWebhook` fallaba después (red, Telegram
 *     caído, URL rechazada), esa fecha quedaba anclada para siempre — el
 *     candado protegía las reconexiones pero no la primera conexión fallida.
 *     El mecanismo actual, sin `NOT NULL` ni `DEFAULT` en la columna, en dos
 *     mitades:
 *       - NINGUNA escritura de FASE 1 la incluye en su payload (mismo patrón
 *         que `setModuleStatus` usa para `installed_at` en ModulesService.ts:
 *         el upsert por `avatar_id` sólo pisa las columnas presentes en el
 *         objeto). Sin `default`, eso deja la columna en NULL si la fila es
 *         nueva, y la deja intacta si ya existía.
 *       - SÓLO FASE 3 (la que activa, tras confirmar `setWebhook`) la
 *         estampa, y sólo si seguía en NULL — ver el `if` sobre
 *         `upserted.connected_at` en `connectTelegramBot`. Así la primera
 *         activación con éxito de un avatar la ancla, y todas las
 *         reconexiones posteriores la dejan intacta: exactamente lo que este
 *         candado pretendía desde el principio, ahora también para el primer
 *         intento.
 *     NULL significa "este avatar nunca activó su bot con éxito" y por tanto
 *     NUNCA FACTURABLE — no es lo mismo que "cero días". Cualquier lectura que
 *     agregue esta columna para facturar (el informe de unidades de la cuota
 *     prorrateada, de otra tarea) debe SALTARSE las filas con `connected_at`
 *     nulo en vez de tratarlas como coste cero.
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
 * update que pone `enabled: true`, limpia `disconnected_at` y estampa
 * `connected_at` si aún estaba vacía (CANDADO 1). La fila nunca dice
 * "conectada" hasta que Telegram confirmó — así que un fallo de `setWebhook`
 * no necesita deshacer nada, porque nunca llegó a mentir.
 */
import { randomBytes } from 'node:crypto'
import { getOrgContext, type OrgContext } from '@/lib/tenant/getOrgContext'
import { orgInsert, orgTable, orgUpsert } from '@/lib/org/orgTable'
import { requireModule } from '@/lib/modules/entitlements'
import { getMediaObject } from '@/lib/mediaStore'
import { getGenerationMediaUrl } from '@/lib/storagePaths'
import type { Database } from '@/@types/database.generated'
import {
    loadTelegramBotToken,
    loadTelegramSettingsForOrg,
    type TelegramSettings,
} from '@/lib/telegram/settings'
import {
    buildTelegramWebhookUrl,
    deleteWebhook,
    getMe,
    getWebhookInfo,
    setWebhook,
    type TelegramWebhookInfo,
} from '@/lib/telegram/client'
import { deliverPaidMedia } from '@/lib/telegram/paidMedia'

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
    /** Fecha de la PRIMERA activación con éxito — sobrevive a desconectar/
     *  reconectar (CANDADO 1). `null` = el bot nunca llegó a activarse
     *  (nunca hubo un `setWebhook` exitoso): NUNCA FACTURABLE, no "cero
     *  días" — quien agregue esta columna para facturar debe SALTARSE las
     *  filas nulas, no tratarlas como coste cero. */
    connectedAt: string | null
}

/**
 * Qué contestó Telegram cuando le preguntamos por el webhook.
 *
 * Existe porque `TelegramWebhookInfo | null` MENTÍA: ese `null` significaba a
 * la vez "este avatar no tiene bot", "Telegram contestó que no hay webhook" y
 * "no pudimos preguntar", y la pantalla afirmaba la segunda para las tres.
 * Un fallo de red acababa acusando a Telegram de algo que no había dicho.
 *
 * "No pudimos preguntar" NO es un estado de este tipo a propósito: viaja por
 * la rama `{success:false, error}` de `TelegramResult`, que es donde ya vive
 * todo lo que falla. Quien consuma esto debe tratar ese fallo como
 * DESCONOCIMIENTO, nunca como ausencia.
 */
export type TelegramWebhookCheck =
    /** No hay bot configurado en este avatar: no había nada que preguntar. */
    | { state: 'no_bot' }
    /** Telegram contestó. Ojo: `info.url === ''` es su forma de decir "no
     *  tengo webhook registrado", y ESE sí es un problema real. */
    | { state: 'answered'; info: TelegramWebhookInfo }

/**
 * Traduce una excepción al contrato `TelegramResult` **y la deja escrita en
 * el log del servidor**.
 *
 * El log no es adorno. Sin él, un fallo de esta capa sólo existía como un
 * string dentro de una tarjeta de la UI, y eso fue lo que hizo invisible
 * durante toda una sesión que "no pude preguntarle a Telegram" se estuviera
 * pintando como "Telegram no tiene webhook". El prefijo `[telegram]` sigue la
 * convención de `src/lib/billing/moduleCharges.ts`.
 */
const fail = (where: string, e: unknown): { success: false; error: string } => {
    console.error(`[telegram] ${where}:`, e)
    return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
    }
}

/**
 * Vista de galería de un ítem de contenido de pago. Deliberadamente sin
 * `telegram_file_id`/`telegram_file_id_bot_id`: son mecánica interna de
 * caché (ver `paidMedia.ts`), no algo que la pantalla necesite pintar — mismo
 * criterio que `TelegramBotStatus` omite `bot_token`.
 */
export interface PaidMediaItemView {
    id: string
    avatarId: string
    generationId: string | null
    title: string
    caption: string | null
    starPrice: number
    mediaKind: 'photo' | 'video'
    enabled: boolean
    sortOrder: number
    storagePath: string
    storageProvider: string | null
    /** URL pública lista para pintar la miniatura — mismo helper que usa el
     *  resto de la galería de generaciones (`getGenerationMediaUrl`). Es la
     *  vista de administración del propio dueño del contenido, no el envío a
     *  Telegram: ese SIEMPRE va por bytes (ver `paidMedia.ts`), nunca por
     *  esta URL. */
    mediaUrl: string
    offersCount: number
    salesCount: number
    starsTotal: number
    createdAt: string
    updatedAt: string
}

/** Único punto fila→DTO de la galería — mismo patrón que `toStatus`. */
function toPaidMediaItem(
    row: Database['public']['Tables']['telegram_paid_media_items']['Row'],
): PaidMediaItemView {
    return {
        id: row.id,
        avatarId: row.avatar_id,
        generationId: row.generation_id,
        title: row.title,
        caption: row.caption,
        starPrice: row.star_price,
        mediaKind: row.media_kind as 'photo' | 'video',
        enabled: row.enabled,
        sortOrder: row.sort_order,
        storagePath: row.storage_path,
        storageProvider: row.storage_provider,
        mediaUrl: getGenerationMediaUrl(row.storage_path, row.storage_provider),
        offersCount: row.offers_count,
        salesCount: row.sales_count,
        starsTotal: row.stars_total,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }
}

/** 10 MB — mismo límite que Telegram acepta por multipart para fotos. */
const MAX_PHOTO_BYTES = 10 * 1024 * 1024
/** 50 MB — ídem para el resto (vídeo). */
const MAX_VIDEO_BYTES = 50 * 1024 * 1024

function formatMb(bytes: number): string {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

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
 * sobre por qué `connected_at` no se toca en FASE 1 pero SÍ en FASE 3 (sólo si
 * seguía vacía), y la nota "ORDEN DE ESCRITURA" en la cabecera del fichero
 * sobre por qué el upsert local va ANTES que `setWebhook` y por qué `enabled`
 * se activa en una segunda escritura, no en la primera.
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
        //
        // `connected_at` OMITIDO A PROPÓSITO (CANDADO 1): la columna ya no
        // tiene `not null default now()` (migración
        // `avatar_telegram_connected_at_nullable`), así que si la fila es
        // nueva queda en NULL — "nunca se activó" — en vez de anclarse a un
        // intento que todavía no sabemos si va a funcionar; si ya existía
        // (reconexión), sobrevive intacta con lo que tuviera.
        // `disconnected_at` TAMBIÉN OMITIDO: si esto es una reconexión tras
        // una baja, su fecha sobrevive intacta mientras `enabled` siga en
        // `false` — coherente con el CANDADO 4, no queda una fila "no
        // habilitada" con fecha de baja en blanco.
        //
        // Se pide `connected_at` de vuelta con `.select()`: es la misma fila
        // que se acaba de escribir (no una consulta ni una carrera aparte), y
        // FASE 3 la necesita para saber si esta activación es la PRIMERA con
        // éxito (columna en NULL) o una reconexión (columna ya poblada).
        const { data: upserted, error } = await orgUpsert(
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
            },
            { onConflict: 'avatar_id' },
        )
            .select('connected_at')
            .single()
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
        await setWebhook(token, {
            url: buildTelegramWebhookUrl(avatarId),
            secretToken: webhookSecret,
        })

        // FASE 3 — Telegram confirmó: ahora sí se marca activa y se limpia la
        // fecha de baja (si la había). Único punto de todo el fichero donde
        // `enabled` pasa a `true`. `connected_at` se estampa AQUÍ sólo si
        // `upserted.connected_at` (leído en FASE 1, misma fila) seguía en
        // NULL — CANDADO 1: la primera activación con éxito la ancla, una
        // reconexión la deja intacta porque el `if` ni siquiera la incluye en
        // el payload.
        const activatePayload: Database['public']['Tables']['avatar_telegram_settings']['Update'] = {
            enabled: true,
            disconnected_at: null,
            updated_at: new Date().toISOString(),
        }
        if (!upserted.connected_at) {
            activatePayload.connected_at = new Date().toISOString()
        }
        const { error: activateError } = await orgTable(ctx, 'avatar_telegram_settings')
            .update(activatePayload)
            .eq('avatar_id', avatarId)
        if (activateError) throw new Error(activateError.message)

        const settings = await loadTelegramSettingsForOrg(ctx, avatarId)
        return { success: true, data: toStatus(settings) }
    } catch (e) {
        return fail('connectTelegramBot', e)
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
        return fail('disconnectTelegramBot', e)
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
        return fail('getTelegramStatus', e)
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
): Promise<TelegramResult<TelegramWebhookCheck>> {
    try {
        const ctx = await getOrgContext()
        await requireModule(ctx, 'telegram')

        const settings = await loadTelegramSettingsForOrg(ctx, avatarId)
        if (!settings) return { success: true, data: { state: 'no_bot' } }

        const token = await loadTelegramBotToken(avatarId)
        if (!token) return { success: true, data: { state: 'no_bot' } }

        const info = await getWebhookInfo(token)
        return { success: true, data: { state: 'answered', info } }
    } catch (e) {
        return fail('getTelegramWebhookInfo', e)
    }
}

/** Galería de contenido de pago de un avatar, ordenada como la pantalla la
 *  pinta (`sort_order`). */
export async function listPaidMediaItems(avatarId: string): Promise<TelegramResult<PaidMediaItemView[]>> {
    try {
        const ctx = await getOrgContext()
        await requireModule(ctx, 'telegram')
        if (!avatarId) return { success: false, error: 'Falta el avatar.' }
        await assertOwnedAvatar(ctx, avatarId)

        const { data, error } = await orgTable(ctx, 'telegram_paid_media_items')
            .select('*')
            .eq('avatar_id', avatarId)
            .order('sort_order', { ascending: true })
        if (error) throw new Error(error.message)
        return { success: true, data: (data ?? []).map(toPaidMediaItem) }
    } catch (e) {
        return fail('listPaidMediaItems', e)
    }
}

/**
 * Da de alta o edita un ítem de la galería.
 *
 * `id` presente ⇒ EDITAR: sólo metadatos (`title`/`caption`/`starPrice`/
 * `enabled`/`sortOrder`). El contenido en sí (`generationId` → `storagePath`/
 * `mediaKind`) es INMUTABLE una vez creado — no se reemplaza aquí. Por eso
 * `enabled`/`sortOrder` son obligatorios en el tipo de entrada y no llevan
 * valor por defecto: si fueran opcionales con un default, una edición que
 * sólo toca el precio y omite `enabled` reactivaría en silencio un ítem que
 * el usuario había deshabilitado a propósito.
 *
 * `id` ausente ⇒ DAR DE ALTA desde una generación existente (`generationId`
 * obligatorio). CANDADO — Step 2 del brief: el tamaño del objeto se valida
 * AQUÍ, ANTES de guardar la fila, contra los mismos límites que
 * `deliverPaidMedia` necesita para poder enviarlo por multipart (10 MB foto /
 * 50 MB vídeo — ver cabecera de `paidMedia.ts`). Un ítem que no se puede
 * enviar no debe poder crearse: descubrirlo en el momento de vender es
 * descubrirlo delante del cliente. La unicidad parcial `(avatar_id,
 * generation_id)` de la migración (Task 1) impide dar de alta el mismo
 * contenido dos veces en el mismo avatar; el choque (23505) se traduce a un
 * mensaje legible en vez de propagar el error crudo de Postgres.
 */
export interface UpsertPaidMediaItemInput {
    /** Presente = editar ese ítem; ausente = dar de alta uno nuevo. */
    id?: string
    avatarId: string
    /** Sólo se usa al DAR DE ALTA — de qué generación sale el contenido. */
    generationId?: string
    title: string
    caption?: string | null
    starPrice: number
    enabled: boolean
    sortOrder: number
}

export async function upsertPaidMediaItem(
    input: UpsertPaidMediaItemInput,
): Promise<TelegramResult<PaidMediaItemView>> {
    try {
        const ctx = await getOrgContext()
        await requireModule(ctx, 'telegram')
        if (!input.avatarId) return { success: false, error: 'Falta el avatar.' }
        const title = input.title?.trim()
        if (!title) return { success: false, error: 'Falta el título.' }
        if (!Number.isInteger(input.starPrice) || input.starPrice < 1 || input.starPrice > 25_000) {
            return {
                success: false,
                error: `El precio debe ser un entero entre 1 y 25000 Stars (recibido: ${input.starPrice}).`,
            }
        }

        await assertOwnedAvatar(ctx, input.avatarId)

        if (input.id) {
            const { data, error } = await orgTable(ctx, 'telegram_paid_media_items')
                .update({
                    title,
                    caption: input.caption ?? null,
                    star_price: input.starPrice,
                    enabled: input.enabled,
                    sort_order: input.sortOrder,
                    updated_at: new Date().toISOString(),
                })
                .eq('avatar_id', input.avatarId)
                .eq('id', input.id)
                .select('*')
                .maybeSingle()
            if (error) throw new Error(error.message)
            if (!data) return { success: false, error: 'Contenido no encontrado en este avatar.' }
            return { success: true, data: toPaidMediaItem(data) }
        }

        if (!input.generationId) return { success: false, error: 'Falta la generación de origen.' }

        const { data: generation, error: genError } = await orgTable(ctx, 'generations')
            .select('id, avatar_id, storage_path, storage_provider, media_type')
            .eq('avatar_id', input.avatarId)
            .eq('id', input.generationId)
            .maybeSingle()
        if (genError) throw new Error(genError.message)
        if (!generation) return { success: false, error: 'Generación no encontrada en este avatar.' }

        const mediaKind: 'photo' | 'video' = generation.media_type === 'VIDEO' ? 'video' : 'photo'

        // CANDADO — tamaño validado AL DAR DE ALTA, no al vender (ver docblock).
        const bytes = await getMediaObject({
            path: generation.storage_path,
            provider: generation.storage_provider,
        })
        const limit = mediaKind === 'video' ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES
        if (bytes.byteLength > limit) {
            const kindLabel = mediaKind === 'video' ? 'vídeo' : 'foto'
            return {
                success: false,
                error: `Ese ${kindLabel} pesa ${formatMb(bytes.byteLength)}; el límite de Telegram para ${kindLabel} es ${formatMb(limit)}.`,
            }
        }

        const { data, error } = await orgInsert(ctx, 'telegram_paid_media_items', {
            avatar_id: input.avatarId,
            generation_id: generation.id,
            storage_path: generation.storage_path,
            storage_provider: generation.storage_provider,
            media_kind: mediaKind,
            title,
            caption: input.caption ?? null,
            star_price: input.starPrice,
            enabled: input.enabled,
            sort_order: input.sortOrder,
        })
            .select('*')
            .single()
        if (error) {
            // Unicidad parcial (avatar_id, generation_id) — Task 1.
            if (error.code === '23505') {
                return {
                    success: false,
                    error: 'Este contenido ya está dado de alta en la galería de este avatar.',
                }
            }
            throw new Error(error.message)
        }
        return { success: true, data: toPaidMediaItem(data) }
    } catch (e) {
        return fail('upsertPaidMediaItem', e)
    }
}

/** Borra un ítem de la galería. Las ventas ya hechas sobreviven: `item_id` en
 *  `telegram_stars_sales` es `on delete set null` (Task 1) — borrar el
 *  catálogo no borra el historial de ingresos. */
export async function deletePaidMediaItem(avatarId: string, itemId: string): Promise<TelegramResult<void>> {
    try {
        const ctx = await getOrgContext()
        await requireModule(ctx, 'telegram')
        if (!avatarId) return { success: false, error: 'Falta el avatar.' }
        if (!itemId) return { success: false, error: 'Falta el contenido a borrar.' }
        await assertOwnedAvatar(ctx, avatarId)

        const { error } = await orgTable(ctx, 'telegram_paid_media_items')
            .delete()
            .eq('avatar_id', avatarId)
            .eq('id', itemId)
        if (error) throw new Error(error.message)
        return { success: true }
    } catch (e) {
        return fail('deletePaidMediaItem', e)
    }
}

export interface SendPaidMediaFromInboxInput {
    avatarId: string
    chatId: string
    itemId: string
    /** Sobrescribe el precio de catálogo SÓLO para esta entrega. */
    stars?: number
    /** Sobrescribe el caption de catálogo SÓLO para esta entrega. */
    caption?: string
}

export interface SendPaidMediaFromInboxResult {
    saleId: string
    stars: number
    telegramMessageId: number
}

/**
 * Envía un ítem de la galería a una conversación de Telegram desde el inbox
 * (acción manual de un humano de la organización — `source: 'inbox'` fijo:
 * esta función ES ese camino, no uno genérico. `deliverPaidMedia` deriva de
 * ahí `soldBy: 'manual'` para la comisión; no se pasa aquí — ver el
 * comentario junto a esa derivación en `paidMedia.ts`).
 *
 * Resuelve y verifica la conversación ANTES de delegar en `deliverPaidMedia`
 * (que no tiene sesión y confía en que su llamador ya hizo esto — mismo
 * reparto de responsabilidades que `recordStarsSale` confiando en el
 * `StarsSaleEvent` que arma el webhook): pertenece a este avatar (y por tanto
 * a esta organización, vía `assertOwnedAvatar`) y es efectivamente una
 * conversación de TELEGRAM — `agent_chats` es una tabla compartida con
 * Fanvue, y enviar Stars a un `external_chat_id` que en realidad es un uuid
 * de Fanvue sería un envío a un destinatario inexistente en Telegram.
 */
export async function sendPaidMediaFromInbox(
    input: SendPaidMediaFromInboxInput,
): Promise<TelegramResult<SendPaidMediaFromInboxResult>> {
    try {
        const ctx = await getOrgContext()
        await requireModule(ctx, 'telegram')
        if (!input.avatarId) return { success: false, error: 'Falta el avatar.' }
        if (!input.chatId) return { success: false, error: 'Falta la conversación.' }
        if (!input.itemId) return { success: false, error: 'Falta el contenido a enviar.' }

        await assertOwnedAvatar(ctx, input.avatarId)

        const { data: chatRow, error: chatError } = await orgTable(ctx, 'agent_chats')
            .select('*')
            .eq('id', input.chatId)
            .eq('avatar_id', input.avatarId)
            .maybeSingle()
        if (chatError) throw new Error(chatError.message)
        if (!chatRow) return { success: false, error: 'Conversación no encontrada en este avatar.' }
        if (chatRow.platform !== 'telegram') {
            return { success: false, error: 'Esta conversación no es de Telegram.' }
        }

        const result = await deliverPaidMedia({
            chat: {
                id: chatRow.id,
                organizationId: chatRow.organization_id,
                avatarId: chatRow.avatar_id,
                externalChatId: chatRow.external_chat_id,
            },
            itemId: input.itemId,
            stars: input.stars,
            caption: input.caption,
            source: 'inbox',
            approvedBy: ctx.userId,
        })

        return {
            success: true,
            data: {
                saleId: result.saleId,
                stars: result.stars,
                telegramMessageId: result.telegramMessageId,
            },
        }
    } catch (e) {
        return fail('sendPaidMediaFromInbox', e)
    }
}
