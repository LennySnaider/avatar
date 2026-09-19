/**
 * F5.2 (Estratega) — Herramienta de lectura: EL ESTADO DEL INBOX.
 *
 * Responde la pregunta que se hace quien abre el panel por la mañana: qué
 * está esperando por mí, qué ha vendido la IA y dónde está apagada.
 *
 * TRES DATOS EN UNA SOLA HERRAMIENTA y no tres herramientas: el prompt de
 * sistema pide responder sin encadenar llamadas innecesarias, y las tres
 * consultas van en paralelo en el mismo turno. Tres herramientas serían tres
 * pasos del bucle del modelo — tres veces el catálogo en tokens de entrada.
 *
 * `telegram_stars_sales` y `avatar_telegram_settings` YA están en
 * `TENANT_TABLES` (ambas con `organization_id NOT NULL` desde la migración
 * del módulo de Telegram), así que se leen por `orgTable` como el resto: no
 * hizo falta ampliar la lista blanca del candado de aislamiento.
 *
 * No se comprueba si el módulo de Telegram está instalado: si no lo está, las
 * tablas devuelven cero filas, que es exactamente la respuesta correcta.
 * Comprobarlo antes costaría una consulta más para llegar al mismo sitio.
 */
import { z } from 'zod'
import { orgTable } from '@/lib/org/orgTable'
import { addDaysIso, utcToday } from '@/lib/earnings/period'
import { fetchAvatarsOverview } from './avatars'
import type { AssistantToolDef, ToolEnv } from '../../types'

/** Ventana de ventas, inclusive hoy. */
const SALES_DAYS = 7
/** Tope que PostgREST aplica en silencio; sirve para DETECTAR el corte. */
const ROW_CAP = 1000

const inboxInput = z.object({
    avatarId: z
        .string()
        .optional()
        .describe(
            'Limita el resumen a un avatar. Si se omite, cubre toda la organización.',
        ),
})

type ChatRow = { platform: string; avatar_id: string }
type SaleRow = { stars: number; sold_by: string }
type TelegramRow = {
    avatar_id: string
    enabled: boolean
    ai_replies_enabled: boolean
}

/** `'social:instagram'` → `'social'`; `'telegram_business'` → `'telegram_business'`. */
function canalDe(platform: string): string {
    return platform.startsWith('social:') ? 'social' : platform
}

export const getInboxSummary: AssistantToolDef<z.infer<typeof inboxInput>> = {
    name: 'getInboxSummary',
    description:
        'Estado del inbox: conversaciones que necesitan atención (por canal), borradores de la IA pendientes de aprobar, ventas de Telegram de los últimos 7 días (separando las que cerró la IA de las manuales) y en qué avatares está la IA encendida o apagada.',
    inputSchema: inboxInput,
    permission: 'content:read',
    // También en 'modules': la decisión de instalar o quitar un módulo
    // (Telegram, por ejemplo) se toma mirando justo estas cifras.
    screens: ['inbox', 'modules', 'other'],
    mutating: false,
    async execute({ avatarId }, { ctx }: ToolEnv) {
        const since = `${addDaysIso(utcToday(), -(SALES_DAYS - 1))}T00:00:00.000Z`

        let atencionQuery = orgTable(ctx, 'agent_chats')
            .select('platform, avatar_id', { count: 'exact' })
            .eq('needs_attention', true)
            .limit(ROW_CAP)
        // Borradores pendientes. Cuando se filtra por avatar, el vínculo se
        // resuelve con un embed `!inner` de PostgREST sobre la clave foránea
        // `agent_messages_chat_id_fkey` (agent_messages.chat_id →
        // agent_chats.id) en vez de leer antes los ids de los chats y meterlos
        // en un `in(...)`. Esa lista podía llegar a 1000 uuids (~37 KB de URL,
        // que el servidor corta con un 414) y, peor, quedarse corta EN
        // SILENCIO por el tope de filas: el conteo saldría menor que el real y
        // nadie lo notaría. Con el embed el número es exacto por construcción
        // y no hay lista que truncar.
        //
        // VERIFICADO EN VIVO contra el PostgREST del proyecto (18-sep): el
        // HEAD con `count=exact` sobre `select=id,agent_chats!inner(avatar_id)`
        // + `agent_chats.avatar_id=eq.<id>` devuelve 200 y EL MISMO total que
        // el control por `chat_id=in.(…)` (2 y 2 sobre datos reales). La
        // relación es de muchos-a-uno, así que el join no duplica filas.
        const borradoresQuery = avatarId
            ? orgTable(ctx, 'agent_messages')
                  .select('id, agent_chats!inner(avatar_id)', {
                      count: 'exact',
                      head: true,
                  })
                  .eq('status', 'draft')
                  .eq('agent_chats.avatar_id', avatarId)
            : orgTable(ctx, 'agent_messages')
                  .select('id', { count: 'exact', head: true })
                  .eq('status', 'draft')
        let ventasQuery = orgTable(ctx, 'telegram_stars_sales')
            .select('stars, sold_by', { count: 'exact' })
            .eq('status', 'purchased')
            .gte('purchased_at', since)
            .limit(ROW_CAP)
        let telegramQuery = orgTable(ctx, 'avatar_telegram_settings').select(
            'avatar_id, enabled, ai_replies_enabled',
        )
        if (avatarId) {
            atencionQuery = atencionQuery.eq('avatar_id', avatarId)
            ventasQuery = ventasQuery.eq('avatar_id', avatarId)
            telegramQuery = telegramQuery.eq('avatar_id', avatarId)
        }

        const [atencionRes, borradoresRes, ventasRes, telegramRes, avatares] =
            await Promise.all([
                atencionQuery,
                borradoresQuery,
                ventasQuery,
                telegramQuery,
                fetchAvatarsOverview(ctx),
            ])
        for (const [nombre, res] of [
            ['agent_chats', atencionRes],
            ['agent_messages', borradoresRes],
            ['telegram_stars_sales', ventasRes],
            ['avatar_telegram_settings', telegramRes],
        ] as const) {
            if (res.error) {
                throw new Error(
                    `getInboxSummary: fallo leyendo ${nombre} (org ${ctx.organizationId}): ${res.error.message}`,
                )
            }
        }

        const chats = (atencionRes.data ?? []) as ChatRow[]
        const porCanal: Record<string, number> = {}
        for (const c of chats) {
            const canal = canalDe(c.platform)
            porCanal[canal] = (porCanal[canal] ?? 0) + 1
        }

        const ventas = (ventasRes.data ?? []) as SaleRow[]
        const ventasIA = ventas.filter((v) => v.sold_by === 'ai')
        const ventasManual = ventas.filter((v) => v.sold_by !== 'ai')
        const sumaStars = (rows: SaleRow[]) =>
            rows.reduce(
                (acc, r) => acc + (Number.isFinite(r.stars) ? r.stars : 0),
                0,
            )

        // El `count` exacto es el total REAL aunque las filas vengan cortadas
        // por el tope de PostgREST; sólo el desglose puede quedarse corto.
        const ventasTruncadas =
            typeof ventasRes.count === 'number' &&
            ventasRes.count > ventas.length
        const atencionTruncada =
            typeof atencionRes.count === 'number' &&
            atencionRes.count > chats.length
        if (ventasTruncadas || atencionTruncada) {
            console.warn(
                '[estratega inbox] desglose truncado por el tope de filas',
                {
                    organizationId: ctx.organizationId,
                    ventas: { count: ventasRes.count, leidas: ventas.length },
                    atencion: {
                        count: atencionRes.count,
                        leidas: chats.length,
                    },
                },
            )
        }

        const telegram = new Map(
            ((telegramRes.data ?? []) as TelegramRow[]).map((t) => [
                t.avatar_id,
                t,
            ]),
        )
        const avataresFiltrados = avatarId
            ? avatares.filter((a) => a.avatarId === avatarId)
            : avatares

        return {
            needsAttention: {
                total: atencionRes.count ?? chats.length,
                byChannel: porCanal,
                ...(atencionTruncada
                    ? {
                          note: 'El desglose por canal es parcial: hay más hilos de los que se pudieron leer.',
                      }
                    : {}),
            },
            pendingDrafts: borradoresRes.count ?? 0,
            telegramSales: {
                periodDays: SALES_DAYS,
                since,
                total: ventasRes.count ?? ventas.length,
                ai: { count: ventasIA.length, stars: sumaStars(ventasIA) },
                manual: {
                    count: ventasManual.length,
                    stars: sumaStars(ventasManual),
                },
                ...(ventasTruncadas
                    ? {
                          note: 'El desglose IA/manual es parcial: hay más ventas de las que se pudieron leer.',
                      }
                    : {}),
            },
            aiByAvatar: avataresFiltrados.map((a) => ({
                avatarId: a.avatarId,
                name: a.name,
                persona: a.aiPersonaEnabled,
                socialComments: a.aiCommentReplies,
                telegram: {
                    connected: Boolean(telegram.get(a.avatarId)?.enabled),
                    aiReplies: Boolean(
                        telegram.get(a.avatarId)?.ai_replies_enabled,
                    ),
                },
            })),
        }
    },
}
