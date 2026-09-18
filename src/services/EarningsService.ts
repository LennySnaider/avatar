'use server'

/**
 * Dashboards de ingresos: el de inicio (toda la organización) y el de cada
 * avatar. Lee dos fuentes con dos unidades que NUNCA se suman entre sí:
 *   - Fanvue: centavos de USD del rollup `fanvue_daily_earnings` (lo llena el
 *     cron `earnings-sync`), cruzado con `avatars.fanvue_creator_uuid`.
 *   - Telegram: Stars de `telegram_stars_sales`, agregadas en vivo.
 * La agregación pasa por los RPC de `src/lib/earnings/queries.ts` (evitan el
 * techo silencioso de 1000 filas de PostgREST); la aritmética de períodos y
 * series es el módulo puro `src/lib/earnings/period.ts`, con tests.
 *
 * Contrato `{ success, data?, error? }` como el resto de servicios: nada
 * lanza hacia el cliente. `fail` sólo registra averías, no rechazos legítimos
 * (permiso, módulo), misma doctrina que AgentTelegramService.
 *
 * Permiso: `content:read` en los tres exports. Ver un dashboard es ver lo que
 * el operador ya ve pieza a pieza (ventas en la pestaña Telegram, chats en el
 * inbox); `refreshEarnings` sólo relee de Fanvue con la conexión que ya existe,
 * no conecta ni desconecta nada.
 *
 * Todos los exports son async porque el fichero es `'use server'`.
 */
import { getOrgContext, type OrgContext } from '@/lib/tenant/getOrgContext'
import { requirePermission, isExpectedDenial } from '@/lib/org/guards'
import { orgTable } from '@/lib/org/orgTable'
import { hasModule } from '@/lib/modules/entitlements'
import { loadTelegramBotToken } from '@/lib/telegram/settings'
import { getMyStarBalance } from '@/lib/telegram/client'
import {
    pickAvatarThumbnailUrl,
    type ThumbnailCandidate,
} from '@/lib/avatarThumbnail'
import {
    fetchEarningsByAvatar,
    fetchEarningsSeries,
} from '@/lib/earnings/queries'
import { syncOrgFanvueEarnings } from '@/lib/earnings/fanvueSync'
import {
    addDaysIso,
    alignPrevious,
    bucketSeries,
    isEarningsPreset,
    pctChange,
    resolvePeriod,
    sumPoints,
    toDensePoints,
    utcToday,
    type EarningsBucket,
    type EarningsPoint,
    type EarningsPreset,
    type EarningsTotals,
    type PeriodWindow,
} from '@/lib/earnings/period'

// ---------------------------------------------------------------------------
// DTOs (todo serializable: la UI los recibe como props)
// ---------------------------------------------------------------------------

export interface EarningsResult<T> {
    success: boolean
    data?: T
    error?: string
}

export interface EarningsKpi {
    current: number
    previous: number
    /** Variación vs el tramo anterior; null sin base de comparación. */
    changePct: number | null
}

export interface EarningsKpis {
    fanvueGrossCents: EarningsKpi
    fanvueNetCents: EarningsKpi
    stars: EarningsKpi
    telegramSales: EarningsKpi
}

export interface OrgEarningsKpis extends EarningsKpis {
    /** Avatares con alguna métrica > 0 en el período. */
    activeAvatars: number
    totalAvatars: number
}

export interface EarningsSeries {
    bucket: EarningsBucket
    current: EarningsPoint[]
    /** Misma longitud que `current`, alineada por índice. */
    previous: EarningsPoint[]
    currentRange: { from: string; to: string }
    previousRange: { from: string; to: string }
}

export interface AvatarEarningsRow {
    avatarId: string
    name: string
    initials: string
    thumbnailUrl: string | null
    fanvueLinked: boolean
    telegramLinked: boolean
    fanvueGrossCents: number
    fanvueNetCents: number
    stars: number
    telegramSales: number
    fanvueNetDeltaPct: number | null
    starsDeltaPct: number | null
    /** Sólo para las primeras filas del ranking (mismos buckets que `series`); vacío en el resto. */
    sparkFanvueNetCents: number[]
    sparkStars: number[]
}

export interface RecentTelegramSale {
    id: string
    avatarId: string
    avatarName: string
    stars: number
    soldBy: 'ai' | 'manual'
    source: string
    purchasedAt: string
    itemTitle: string | null
}

export interface FanvueSyncStatus {
    connected: boolean
    /** Avatares con `fanvue_creator_uuid` asignado. */
    mappedCreators: number
    /** Avatares sin creator asignado (cuenta propia): fuera del rollup en v1. */
    selfAvatars: number
    lastSyncedAt: string | null
    /** La conexión tiene `read:insights` (desglose por tipo, fase C). */
    hasInsightsScope: boolean
}

export interface TelegramStatus {
    installed: boolean
    /** Bots conectados y activos. */
    bots: number
}

export interface EarningsMeta {
    truncated: boolean
    /** La ventana incluye hoy y Fanvue está conectado: el último día puede crecer. */
    todayIncomplete: boolean
    generatedAt: string
}

export interface EarningsPeriodDto {
    preset: EarningsPreset
    from: string
    to: string
    prevFrom: string
    prevTo: string
}

export interface OrgEarningsDashboard {
    period: EarningsPeriodDto
    kpis: OrgEarningsKpis
    series: EarningsSeries
    byAvatar: AvatarEarningsRow[]
    recentTelegramSales: RecentTelegramSale[]
    fanvue: FanvueSyncStatus
    telegram: TelegramStatus
    meta: EarningsMeta
}

export interface AvatarEarningsDashboard {
    period: EarningsPeriodDto
    avatar: {
        id: string
        name: string
        initials: string
        thumbnailUrl: string | null
        fanvueCreatorUuid: string | null
        fanvueCreatorHandle: string | null
        telegramBotUsername: string | null
        telegramBotEnabled: boolean
    }
    kpis: EarningsKpis
    series: EarningsSeries
    /** Saldo de Stars del bot, en vivo. null = sin bot o no se pudo leer. */
    starBalance: number | null
    recentTelegramSales: RecentTelegramSale[]
    /** Contenidos más vendidos (contadores históricos del ítem, no del período). */
    topItems: { id: string; title: string; sales: number; stars: number }[]
    agent: {
        /** Contadores del MES EN CURSO (agent_usage_counters es mensual). */
        month: string
        messagesSent: number
        autoSent: number
        /** Ventas del período por quién las cerró. */
        aiSales: number
        manualSales: number
        aiSalesPct: number | null
    } | null
    /** Desglose por tipo de Fanvue: fase C (requiere read:insights). */
    fanvueBreakdown: null
    fanvue: FanvueSyncStatus
    telegram: TelegramStatus
    meta: EarningsMeta
}

export interface RefreshEarningsData {
    rowsUpserted: number
    lastSyncedAt: string | null
    /** Si la llamada se ignoró por el piso de 60 s, hasta cuándo. */
    throttledUntil: string | null
}

// ---------------------------------------------------------------------------
// Internos
// ---------------------------------------------------------------------------

const fail = (where: string, e: unknown): { success: false; error: string } => {
    if (!isExpectedDenial(e)) console.error(`[earnings] ${where}:`, e)
    return { success: false, error: e instanceof Error ? e.message : String(e) }
}

/** Cuántas filas del ranking llevan sparkline (una RPC por avatar). */
const SPARKLINE_ROWS = 10

/** Piso entre refrescos manuales por org, en memoria (best-effort por instancia). */
const REFRESH_FLOOR_MS = 60_000
const lastRefreshByOrg = new Map<string, number>()

interface AvatarRowRaw {
    id: string
    name: string
    fanvue_creator_uuid: string | null
    avatar_references: ThumbnailCandidate[] | null
}

interface SaleRowRaw {
    id: string
    avatar_id: string
    stars: number
    sold_by: string
    source: string
    purchased_at: string | null
    item: { title: string | null } | { title: string | null }[] | null
}

function initialsOf(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '')
    return letters.join('') || '?'
}

function kpi(current: number, previous: number): EarningsKpi {
    return { current, previous, changePct: pctChange(current, previous) }
}

function kpisOf(
    current: EarningsTotals,
    previous: EarningsTotals,
): EarningsKpis {
    return {
        fanvueGrossCents: kpi(
            current.fanvueGrossCents,
            previous.fanvueGrossCents,
        ),
        fanvueNetCents: kpi(current.fanvueNetCents, previous.fanvueNetCents),
        stars: kpi(current.stars, previous.stars),
        telegramSales: kpi(current.telegramSales, previous.telegramSales),
    }
}

function periodDto(w: PeriodWindow): EarningsPeriodDto {
    return {
        preset: w.preset,
        from: w.from,
        to: w.to,
        prevFrom: w.prevFrom,
        prevTo: w.prevTo,
    }
}

function resolvePresetOrThrow(preset: string): PeriodWindow {
    if (!isEarningsPreset(preset))
        throw new Error(`Período no válido: ${String(preset)}`)
    return resolvePeriod(preset)
}

/** Serie actual + anterior (alineada) y los totales de ambas, para un avatar o toda la org. */
async function loadSeries(
    organizationId: string,
    w: PeriodWindow,
    avatarId?: string | null,
): Promise<{
    series: EarningsSeries
    totals: { current: EarningsTotals; previous: EarningsTotals }
    truncated: boolean
}> {
    const [cur, prev] = await Promise.all([
        fetchEarningsSeries(organizationId, w.from, w.to, avatarId),
        fetchEarningsSeries(organizationId, w.prevFrom, w.prevTo, avatarId),
    ])
    const currentDense = toDensePoints(w.from, w.to, cur.rows)
    const previousDense = toDensePoints(w.prevFrom, w.prevTo, prev.rows)
    const current = bucketSeries(currentDense, w.bucket)
    const previous = alignPrevious(
        current,
        bucketSeries(previousDense, w.bucket),
    )
    return {
        series: {
            bucket: w.bucket,
            current,
            previous,
            currentRange: { from: w.from, to: w.to },
            previousRange: { from: w.prevFrom, to: w.prevTo },
        },
        totals: {
            current: sumPoints(currentDense),
            previous: sumPoints(previousDense),
        },
        truncated: cur.truncated || prev.truncated,
    }
}

async function loadFanvueStatus(
    ctx: OrgContext,
    avatars: AvatarRowRaw[],
): Promise<FanvueSyncStatus> {
    const [{ data: conn }, { data: last }] = await Promise.all([
        orgTable(ctx, 'fanvue_connections')
            .select('refresh_token, scopes')
            .maybeSingle(),
        orgTable(ctx, 'fanvue_daily_earnings')
            .select('synced_at')
            .order('synced_at', { ascending: false })
            .limit(1),
    ])
    const connection = conn as {
        refresh_token: string | null
        scopes: string[] | null
    } | null
    const lastRow = ((last ?? []) as { synced_at: string }[])[0]
    return {
        connected: Boolean(connection?.refresh_token),
        mappedCreators: avatars.filter((a) => a.fanvue_creator_uuid).length,
        selfAvatars: avatars.filter((a) => !a.fanvue_creator_uuid).length,
        lastSyncedAt: lastRow?.synced_at ?? null,
        hasInsightsScope: Boolean(
            connection?.scopes?.includes('read:insights'),
        ),
    }
}

async function loadTelegramBots(
    ctx: OrgContext,
    installed: boolean,
): Promise<Map<string, { botUsername: string | null; enabled: boolean }>> {
    const bots = new Map<
        string,
        { botUsername: string | null; enabled: boolean }
    >()
    if (!installed) return bots
    const { data, error } = await orgTable(
        ctx,
        'avatar_telegram_settings',
    ).select('avatar_id, bot_username, enabled')
    if (error) throw new Error(error.message)
    for (const row of (data ?? []) as {
        avatar_id: string
        bot_username: string | null
        enabled: boolean
    }[]) {
        bots.set(row.avatar_id, {
            botUsername: row.bot_username,
            enabled: row.enabled,
        })
    }
    return bots
}

async function loadRecentSales(
    ctx: OrgContext,
    installed: boolean,
    namesById: Map<string, string>,
    avatarId?: string,
): Promise<RecentTelegramSale[]> {
    if (!installed) return []
    let query = orgTable(ctx, 'telegram_stars_sales')
        .select(
            'id, avatar_id, stars, sold_by, source, purchased_at, item:telegram_paid_media_items(title)',
        )
        .eq('status', 'purchased')
        .order('purchased_at', { ascending: false })
        .limit(10)
    if (avatarId) query = query.eq('avatar_id', avatarId)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    return ((data ?? []) as SaleRowRaw[]).map((s) => {
        const item = Array.isArray(s.item) ? (s.item[0] ?? null) : s.item
        return {
            id: s.id,
            avatarId: s.avatar_id,
            avatarName: namesById.get(s.avatar_id) ?? 'Avatar',
            stars: s.stars,
            soldBy: s.sold_by === 'ai' ? 'ai' : 'manual',
            source: s.source,
            purchasedAt: s.purchased_at ?? '',
            itemTitle: item?.title ?? null,
        }
    })
}

function utcStart(day: string): string {
    return `${day}T00:00:00.000Z`
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export async function getOrgEarningsDashboard(
    preset: string,
): Promise<EarningsResult<OrgEarningsDashboard>> {
    try {
        const ctx = await getOrgContext()
        requirePermission(ctx, 'content:read')
        const w = resolvePresetOrThrow(preset)

        const { data: avatarRows, error: avatarsError } = await orgTable(
            ctx,
            'avatars',
        )
            .select(
                'id, name, fanvue_creator_uuid, avatar_references(type, storage_path, storage_provider, created_at)',
            )
            .order('created_at', { ascending: true })
        if (avatarsError) throw new Error(avatarsError.message)
        const avatars = (avatarRows ?? []) as AvatarRowRaw[]
        const namesById = new Map(avatars.map((a) => [a.id, a.name]))

        const telegramInstalled = await hasModule(ctx, 'telegram')
        const [
            seriesData,
            byAvatarCur,
            byAvatarPrev,
            fanvue,
            bots,
            recentTelegramSales,
        ] = await Promise.all([
            loadSeries(ctx.organizationId, w),
            fetchEarningsByAvatar(ctx.organizationId, w.from, w.to),
            fetchEarningsByAvatar(ctx.organizationId, w.prevFrom, w.prevTo),
            loadFanvueStatus(ctx, avatars),
            loadTelegramBots(ctx, telegramInstalled),
            loadRecentSales(ctx, telegramInstalled, namesById),
        ])

        // Ranking: filas del RPC fundidas sobre la lista COMPLETA de avatares
        // (los que no vendieron nada salen a cero, no desaparecen).
        type Agg = {
            fanvueGrossCents: number
            fanvueNetCents: number
            stars: number
            telegramSales: number
        }
        const aggregate = (rows: typeof byAvatarCur.rows) => {
            const map = new Map<string, Agg>()
            for (const r of rows) {
                const agg = map.get(r.avatar_id) ?? {
                    fanvueGrossCents: 0,
                    fanvueNetCents: 0,
                    stars: 0,
                    telegramSales: 0,
                }
                if (r.source === 'fanvue') {
                    agg.fanvueGrossCents += Number(r.usd_gross_cents) || 0
                    agg.fanvueNetCents += Number(r.usd_net_cents) || 0
                } else if (r.source === 'telegram') {
                    agg.stars += Number(r.stars) || 0
                    agg.telegramSales += Number(r.sales_count) || 0
                }
                map.set(r.avatar_id, agg)
            }
            return map
        }
        const curByAvatar = aggregate(byAvatarCur.rows)
        const prevByAvatar = aggregate(byAvatarPrev.rows)
        const zero: Agg = {
            fanvueGrossCents: 0,
            fanvueNetCents: 0,
            stars: 0,
            telegramSales: 0,
        }

        const byAvatar: AvatarEarningsRow[] = avatars
            .map((a) => {
                const cur = curByAvatar.get(a.id) ?? zero
                const prev = prevByAvatar.get(a.id) ?? zero
                return {
                    avatarId: a.id,
                    name: a.name,
                    initials: initialsOf(a.name),
                    thumbnailUrl: pickAvatarThumbnailUrl(a.avatar_references),
                    fanvueLinked: Boolean(a.fanvue_creator_uuid),
                    telegramLinked: bots.has(a.id),
                    fanvueGrossCents: cur.fanvueGrossCents,
                    fanvueNetCents: cur.fanvueNetCents,
                    stars: cur.stars,
                    telegramSales: cur.telegramSales,
                    fanvueNetDeltaPct: pctChange(
                        cur.fanvueNetCents,
                        prev.fanvueNetCents,
                    ),
                    starsDeltaPct: pctChange(cur.stars, prev.stars),
                    sparkFanvueNetCents: [] as number[],
                    sparkStars: [] as number[],
                }
            })
            .sort(
                (x, y) =>
                    y.fanvueNetCents - x.fanvueNetCents ||
                    y.stars - x.stars ||
                    x.name.localeCompare(y.name),
            )

        // Sparklines sólo para la cabeza del ranking: una RPC por avatar.
        const head = byAvatar
            .slice(0, SPARKLINE_ROWS)
            .filter((r) => r.fanvueNetCents > 0 || r.stars > 0)
        const sparks = await Promise.all(
            head.map((r) =>
                fetchEarningsSeries(
                    ctx.organizationId,
                    w.from,
                    w.to,
                    r.avatarId,
                ),
            ),
        )
        head.forEach((row, i) => {
            const points = bucketSeries(
                toDensePoints(w.from, w.to, sparks[i].rows),
                w.bucket,
            )
            row.sparkFanvueNetCents = points.map((p) => p.fanvueNetCents)
            row.sparkStars = points.map((p) => p.stars)
        })

        const activeAvatars = byAvatar.filter(
            (r) => r.fanvueGrossCents > 0 || r.stars > 0 || r.telegramSales > 0,
        ).length

        const data: OrgEarningsDashboard = {
            period: periodDto(w),
            kpis: {
                ...kpisOf(
                    seriesData.totals.current,
                    seriesData.totals.previous,
                ),
                activeAvatars,
                totalAvatars: avatars.length,
            },
            series: seriesData.series,
            byAvatar,
            recentTelegramSales,
            fanvue,
            telegram: {
                installed: telegramInstalled,
                bots: [...bots.values()].filter((b) => b.enabled).length,
            },
            meta: {
                truncated:
                    seriesData.truncated ||
                    byAvatarCur.truncated ||
                    byAvatarPrev.truncated,
                todayIncomplete: fanvue.connected && w.to === utcToday(),
                generatedAt: new Date().toISOString(),
            },
        }
        return { success: true, data }
    } catch (e) {
        return fail('getOrgEarningsDashboard', e)
    }
}

export async function getAvatarEarningsDashboard(
    avatarId: string,
    preset: string,
): Promise<EarningsResult<AvatarEarningsDashboard>> {
    try {
        const ctx = await getOrgContext()
        requirePermission(ctx, 'content:read')
        const w = resolvePresetOrThrow(preset)

        // orgTable ya acota por organization_id: un avatar de otra org es null
        // igual que uno inexistente (mismo criterio que telegram/[slug]).
        const { data: avatarRow, error: avatarError } = await orgTable(
            ctx,
            'avatars',
        )
            .select(
                'id, name, fanvue_creator_uuid, avatar_references(type, storage_path, storage_provider, created_at)',
            )
            .eq('id', avatarId)
            .maybeSingle()
        if (avatarError) throw new Error(avatarError.message)
        if (!avatarRow) return { success: false, error: 'not_found' }
        const avatar = avatarRow as AvatarRowRaw

        // Para el estado de Fanvue (creators asignados / sin asignar) hace
        // falta la lista de la org, no sólo este avatar.
        const { data: allAvatarRows } = await orgTable(ctx, 'avatars').select(
            'id, name, fanvue_creator_uuid',
        )
        const allAvatars = (
            (allAvatarRows ?? []) as Omit<AvatarRowRaw, 'avatar_references'>[]
        ).map((a) => ({ ...a, avatar_references: null }))
        const namesById = new Map(allAvatars.map((a) => [a.id, a.name]))

        const telegramInstalled = await hasModule(ctx, 'telegram')
        const month = utcToday().slice(0, 7)
        const [
            seriesData,
            fanvue,
            bots,
            recentTelegramSales,
            creatorRes,
            itemsRes,
            countersRes,
            aiRes,
            manualRes,
        ] = await Promise.all([
            loadSeries(ctx.organizationId, w, avatar.id),
            loadFanvueStatus(ctx, allAvatars),
            loadTelegramBots(ctx, telegramInstalled),
            loadRecentSales(ctx, telegramInstalled, namesById, avatar.id),
            avatar.fanvue_creator_uuid
                ? orgTable(ctx, 'fanvue_creators')
                      .select('handle, display_name')
                      .eq('creator_user_uuid', avatar.fanvue_creator_uuid)
                      .limit(1)
                : Promise.resolve({ data: null }),
            telegramInstalled
                ? orgTable(ctx, 'telegram_paid_media_items')
                      .select('id, title, sales_count, stars_total')
                      .eq('avatar_id', avatar.id)
                      .gt('sales_count', 0)
                      .order('stars_total', { ascending: false })
                      .limit(5)
                : Promise.resolve({ data: null }),
            orgTable(ctx, 'agent_usage_counters')
                .select('counter, value')
                .eq('avatar_id', avatar.id)
                .eq('period', month),
            telegramInstalled
                ? orgTable(ctx, 'telegram_stars_sales')
                      .select('id', { count: 'exact', head: true })
                      .eq('avatar_id', avatar.id)
                      .eq('status', 'purchased')
                      .eq('sold_by', 'ai')
                      .gte('purchased_at', utcStart(w.from))
                      .lt('purchased_at', utcStart(addDaysIso(w.to, 1)))
                : Promise.resolve({ count: 0 }),
            telegramInstalled
                ? orgTable(ctx, 'telegram_stars_sales')
                      .select('id', { count: 'exact', head: true })
                      .eq('avatar_id', avatar.id)
                      .eq('status', 'purchased')
                      .eq('sold_by', 'manual')
                      .gte('purchased_at', utcStart(w.from))
                      .lt('purchased_at', utcStart(addDaysIso(w.to, 1)))
                : Promise.resolve({ count: 0 }),
        ])

        const creator = (
            (creatorRes.data ?? []) as {
                handle: string | null
                display_name: string | null
            }[]
        )[0]
        const bot = bots.get(avatar.id) ?? null

        // Saldo de Stars en vivo. `loadTelegramBotToken` es la variante SIN
        // sesión: segura aquí porque ya confirmamos arriba que el avatar es de
        // esta org, y porque el token nunca sale de esta función (mismo patrón
        // que telegram/[slug]/page.tsx).
        let starBalance: number | null = null
        if (telegramInstalled && bot) {
            try {
                const token = await loadTelegramBotToken(avatar.id)
                if (token) starBalance = (await getMyStarBalance(token)).amount
            } catch (e) {
                console.warn(
                    `[earnings] saldo de Stars de ${avatar.id} no disponible`,
                    e,
                )
            }
        }

        const counters = new Map(
            (
                (countersRes.data ?? []) as { counter: string; value: number }[]
            ).map((c) => [c.counter, c.value]),
        )
        const aiSales = Number(aiRes.count ?? 0)
        const manualSales = Number(manualRes.count ?? 0)
        const hasAgentData = counters.size > 0 || aiSales + manualSales > 0
        const agent = hasAgentData
            ? {
                  month,
                  messagesSent: counters.get('messages_sent') ?? 0,
                  autoSent: counters.get('auto_sent') ?? 0,
                  aiSales,
                  manualSales,
                  aiSalesPct:
                      aiSales + manualSales > 0
                          ? Math.round(
                                (aiSales / (aiSales + manualSales)) * 1000,
                            ) / 10
                          : null,
              }
            : null

        const data: AvatarEarningsDashboard = {
            period: periodDto(w),
            avatar: {
                id: avatar.id,
                name: avatar.name,
                initials: initialsOf(avatar.name),
                thumbnailUrl: pickAvatarThumbnailUrl(avatar.avatar_references),
                fanvueCreatorUuid: avatar.fanvue_creator_uuid,
                fanvueCreatorHandle:
                    creator?.handle ?? creator?.display_name ?? null,
                telegramBotUsername: bot?.botUsername ?? null,
                telegramBotEnabled: Boolean(bot?.enabled),
            },
            kpis: kpisOf(seriesData.totals.current, seriesData.totals.previous),
            series: seriesData.series,
            starBalance,
            recentTelegramSales,
            topItems: (
                (itemsRes.data ?? []) as {
                    id: string
                    title: string
                    sales_count: number
                    stars_total: number
                }[]
            ).map((i) => ({
                id: i.id,
                title: i.title,
                sales: i.sales_count,
                stars: i.stars_total,
            })),
            agent,
            fanvueBreakdown: null,
            fanvue,
            telegram: {
                installed: telegramInstalled,
                bots: [...bots.values()].filter((b) => b.enabled).length,
            },
            meta: {
                truncated: seriesData.truncated,
                todayIncomplete: fanvue.connected && w.to === utcToday(),
                generatedAt: new Date().toISOString(),
            },
        }
        return { success: true, data }
    } catch (e) {
        return fail('getAvatarEarningsDashboard', e)
    }
}

/**
 * Relee de Fanvue ayer y hoy para ESTA org (la sincronización normal es el
 * cron horario). La conexión se busca por la org del ctx, no por el usuario:
 * la conexión es de la org (ver tokenStore.ts), y quien pulsa "Actualizar" no
 * tiene por qué ser quien la conectó.
 */
export async function refreshEarnings(): Promise<
    EarningsResult<RefreshEarningsData>
> {
    try {
        const ctx = await getOrgContext()
        requirePermission(ctx, 'content:read')

        const { data: conn, error } = await orgTable(ctx, 'fanvue_connections')
            .select('id, user_id, refresh_token')
            .maybeSingle()
        if (error) throw new Error(error.message)
        const connection = conn as {
            id: string
            user_id: string
            refresh_token: string | null
        } | null
        if (!connection?.refresh_token) {
            return {
                success: false,
                error: 'Conecta Fanvue primero para poder sincronizar sus ingresos.',
            }
        }

        const last = lastRefreshByOrg.get(ctx.organizationId) ?? 0
        const now = Date.now()
        if (now - last < REFRESH_FLOOR_MS) {
            return {
                success: true,
                data: {
                    rowsUpserted: 0,
                    lastSyncedAt: null,
                    throttledUntil: new Date(
                        last + REFRESH_FLOOR_MS,
                    ).toISOString(),
                },
            }
        }
        lastRefreshByOrg.set(ctx.organizationId, now)

        const today = utcToday()
        const result = await syncOrgFanvueEarnings({
            connectionId: connection.id,
            organizationId: ctx.organizationId,
            userId: connection.user_id,
            from: addDaysIso(today, -1),
            to: today,
        })
        if (result.skipped === 'connection_mismatch') {
            return {
                success: false,
                error: 'La conexión de Fanvue la creó un usuario cuya organización principal es otra: no se puede usar su token desde aquí.',
            }
        }
        if (result.skipped === 'no_mapped_creators') {
            return {
                success: false,
                error: 'Ningún avatar tiene un creator de Fanvue asignado. Asígnalos en Fanvue → Cuenta.',
            }
        }
        return {
            success: true,
            data: {
                rowsUpserted: result.rowsUpserted,
                lastSyncedAt: new Date().toISOString(),
                throttledUntil: null,
            },
        }
    } catch (e) {
        return fail('refreshEarnings', e)
    }
}
