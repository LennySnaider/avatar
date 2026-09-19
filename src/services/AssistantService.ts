'use server'

/**
 * F5.2 (Estratega) Task 4 — EL SERVICIO del agente de IA de la organización:
 * todo lo que el widget necesita del Estratega y que NO es el turno en sí.
 *
 * El turno vive en `POST /api/assistant/chat` porque tiene que STREAMEAR, y
 * una server action no puede. Aquí está el resto: los hilos (listar, leer,
 * crear, borrar), el estado del módulo (ajustes, Meta, consumo de hoy) y las
 * dos escrituras de configuración.
 *
 * Todos los exports son async porque el fichero es `'use server'`: un export
 * síncrono aquí sólo revienta en el BUILD — ni tsc ni eslint lo ven (comprobar
 * con `grep -n "^export" src/services/AssistantService.ts`).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA CADENA DE ACCESO, Y LA EXCEPCIÓN DELIBERADA
 * ─────────────────────────────────────────────────────────────────────────
 * El camino normal es `getOrgContext` → `requireModule` → `requirePermission`,
 * y lo encapsula `ctxEstratega(permiso)` para que ninguna función se lo salte
 * por descuido. Un export NO usa ese helper, y conviene saber por qué:
 *  - `getStrategistStatus` comprueba el permiso pero NO exige el módulo: su
 *    trabajo es precisamente CONTESTAR si está instalado (`installed: false`).
 *    Lanzar ahí obligaría a la pantalla a leer un error para pintar un estado
 *    normal.
 * Y dos exports pasan por la cadena pidiendo un permiso MÁS ALTO que
 * `content:read`: `updateStrategistSettings` (`module:manage`) y
 * `startMetaConsent` (`connection:manage`). Leer el asistente lo puede hacer
 * un operator; cambiarle el presupuesto o conectar la cuenta de Meta de la
 * organización, no.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * `getMetaConnection` ACUÑA UN RETO: LLÁMALO UNA VEZ POR APERTURA
 * ─────────────────────────────────────────────────────────────────────────
 * El provider en modo `eager` pregunta a Vercel Connect y, si no hay grant,
 * PIDE que se acuñe una URL de consentimiento. Es una llamada de red con
 * efecto, no un `select`. En todo el módulo sólo hay dos sitios que la hacen:
 * `getStrategistStatus` y `startMetaConsent` (y la ruta del turno, una vez
 * por turno). El widget debe llamar a `getStrategistStatus` UNA VEZ AL ABRIR
 * el panel y guardarse el resultado — NO en cada render ni en cada tecla: una
 * llamada por pulsación convertiría el indicador de "Meta conectado" en una
 * tormenta de retos contra Connect.
 *
 * `fail()` LOGUEA (salvo los rechazos legítimos), como en
 * `AgentTelegramService`: un fallo que sólo existe dentro de una tarjeta de
 * la UI es un fallo que nadie diagnostica.
 */
import { getOrgContext, type OrgContext } from '@/lib/tenant/getOrgContext'
import { ctxCan, isExpectedDenial, requirePermission } from '@/lib/org/guards'
import type { Permission } from '@/lib/org/permissions'
import { orgInsert, orgTable } from '@/lib/org/orgTable'
import { hasModule, requireModule } from '@/lib/modules/entitlements'
import { getMetaConnection } from '@/lib/assistant/meta/connect'
import {
    DEFAULT_STRATEGIST_SETTINGS,
    readStrategistSettings,
    type StrategistSettings,
} from '@/lib/assistant/budget'
import { parseAssistantScreen } from '@/lib/assistant/route/validate'
import { THREAD_TITLE_MAX } from '@/lib/assistant/route/threadTitle'
import {
    USAGE_ROWS_LIMIT,
    sumCostUsd,
    sumTokensCharged,
    usageMaybeTruncated,
    utcDayStart,
} from '@/lib/assistant/route/usage'
import type { AssistantScreen } from '@/lib/assistant/types'
import type { Json } from '@/@types/database.generated'

const MODULE_SLUG = 'strategist'

/** Cuántos hilos ve la lista del widget. Más no cabe en un panel lateral. */
const THREADS_LIMIT = 50

/** Tope de turnos que se cargan de un hilo. PostgREST capa en 1000 de todos modos. */
const MESSAGES_LIMIT = 500

export interface AssistantResult<T> {
    success: boolean
    data?: T
    error?: string
}

/** Fila de la lista de hilos. */
export interface AssistantThreadSummary {
    id: string
    title: string | null
    screen: AssistantScreen
    updatedAt: string
}

/** Un turno ya guardado. `content` son las `parts` del UIMessage, tal cual. */
export interface AssistantMessageView {
    id: string
    role: 'user' | 'assistant' | 'system'
    content: unknown
    model: string | null
    tokensCharged: number
    createdAt: string
}

export interface AssistantThreadView {
    thread: AssistantThreadSummary
    messages: AssistantMessageView[]
}

export interface StrategistStatus {
    /** ¿Está el módulo instalado en esta organización? */
    installed: boolean
    /** Ya normalizados: nunca faltan campos (ver `budget.ts`). */
    settings: StrategistSettings
    meta: { connected: boolean; consentUrl?: string }
    /**
     * ¿Puede ESTE usuario conectar la cuenta de Meta de la organización?
     *
     * Es `connection:manage`, el mismo permiso que exige `startMetaConsent`.
     * Va en el estado porque la UI tiene que decidir entre pintar el botón
     * "Conectar Meta" o pedir un administrador: sin esto, un operator veía un
     * botón que siempre terminaba en un toast de rechazo.
     */
    canConnectMeta: boolean
    /** Consumo del día natural UTC en curso. */
    usageToday: { tokens: number; costUsd: number }
}

/**
 * Traduce una excepción al contrato de retorno **y la deja en el log**.
 *
 * Un rechazo legítimo (rol insuficiente, módulo no instalado) NO se loguea:
 * si todo se registra como error, nada destaca. Misma doctrina que separa
 * `fail` de `failFromError` en `ModulesService`.
 */
function fail(where: string, e: unknown): AssistantResult<never> {
    if (!isExpectedDenial(e)) console.error(`[estratega] ${where}:`, e)
    return { success: false, error: e instanceof Error ? e.message : String(e) }
}

/** `getOrgContext` → permiso. La mitad de la cadena que no toca la base. */
async function ctxConPermiso(permiso: Permission): Promise<OrgContext> {
    const ctx = await getOrgContext()
    requirePermission(ctx, permiso)
    return ctx
}

/**
 * La cadena entera, en el orden canónico del plan: `getOrgContext` →
 * `requireModule` → `requirePermission`. Todo lo que toca hilos pasa por aquí.
 *
 * El módulo va ANTES que el permiso a propósito: "esta organización no ha
 * comprado el Estratega" es una frase sobre la organización, y decirle a un
 * operator "tu rol no puede" cuando el módulo ni siquiera está instalado le
 * manda a pedirle permisos a un administrador que tampoco lo tendría.
 */
async function ctxEstratega(permiso: Permission): Promise<OrgContext> {
    const ctx = await getOrgContext()
    await requireModule(ctx, MODULE_SLUG)
    requirePermission(ctx, permiso)
    return ctx
}

interface FilaHilo {
    id: string
    title: string | null
    screen: string | null
    updated_at: string
}

function aResumen(row: FilaHilo): AssistantThreadSummary {
    return {
        id: row.id,
        title: row.title,
        // La columna es texto libre en la base; se normaliza al salir para
        // que la UI no tenga que defenderse de una pantalla que ya no existe.
        screen: parseAssistantScreen(row.screen),
        updatedAt: row.updated_at,
    }
}

/** Los hilos de la organización, el más reciente primero. */
export async function listAssistantThreads(): Promise<
    AssistantResult<AssistantThreadSummary[]>
> {
    try {
        const ctx = await ctxEstratega('content:read')
        const { data, error } = await orgTable(ctx, 'org_assistant_threads')
            .select('id, title, screen, updated_at')
            .order('updated_at', { ascending: false })
            .limit(THREADS_LIMIT)
        if (error) throw new Error(error.message)
        return {
            success: true,
            data: ((data ?? []) as FilaHilo[]).map(aResumen),
        }
    } catch (e) {
        return fail('listAssistantThreads', e)
    }
}

/** Un hilo con sus turnos en orden cronológico. */
export async function getAssistantThread(
    threadId: string,
): Promise<AssistantResult<AssistantThreadView>> {
    try {
        const ctx = await ctxEstratega('content:read')
        const { data: hilo, error: errorHilo } = await orgTable(
            ctx,
            'org_assistant_threads',
        )
            .select('id, title, screen, updated_at')
            .eq('id', threadId)
            .maybeSingle()
        if (errorHilo) throw new Error(errorHilo.message)
        // Fuera de la org el hilo no existe. No se distingue de "borrado" a
        // propósito: un mensaje distinto confirmaría que ese id existe en OTRA
        // organización.
        if (!hilo) return { success: false, error: 'Ese hilo no existe.' }

        const { data: mensajes, error: errorMensajes } = await orgTable(
            ctx,
            'org_assistant_messages',
        )
            .select('id, role, content, model, tokens_charged, created_at')
            .eq('thread_id', threadId)
            .order('created_at', { ascending: true })
            .limit(MESSAGES_LIMIT)
        if (errorMensajes) throw new Error(errorMensajes.message)

        type FilaMensaje = {
            id: string
            role: string
            content: unknown
            model: string | null
            tokens_charged: number | null
            created_at: string
        }
        return {
            success: true,
            data: {
                thread: aResumen(hilo as FilaHilo),
                messages: ((mensajes ?? []) as FilaMensaje[]).map((m) => ({
                    id: m.id,
                    role: m.role as AssistantMessageView['role'],
                    content: m.content,
                    model: m.model,
                    tokensCharged: m.tokens_charged ?? 0,
                    createdAt: m.created_at,
                })),
            },
        }
    } catch (e) {
        return fail('getAssistantThread', e)
    }
}

/**
 * Abre un hilo vacío.
 *
 * NO hace falta para chatear: la ruta crea el hilo sola cuando llega un
 * mensaje sin `threadId` (y así el título sale de la primera pregunta). Esto
 * es para el botón "nueva conversación" del widget, que quiere el hilo antes
 * de que el usuario escriba nada.
 */
export async function createAssistantThread({
    screen,
    title,
}: {
    screen: AssistantScreen
    title?: string
}): Promise<AssistantResult<AssistantThreadSummary>> {
    try {
        const ctx = await ctxEstratega('content:read')
        const limpio = (title ?? '').trim().slice(0, THREAD_TITLE_MAX)
        const { data, error } = await orgInsert(ctx, 'org_assistant_threads', {
            title: limpio.length > 0 ? limpio : null,
            created_by: ctx.userId,
            screen: parseAssistantScreen(screen),
        })
            .select('id, title, screen, updated_at')
            .single()
        if (error) throw new Error(error.message)
        return { success: true, data: aResumen(data as FilaHilo) }
    } catch (e) {
        return fail('createAssistantThread', e)
    }
}

/**
 * Borra un hilo con todos sus turnos (`on delete cascade` en la migración).
 *
 * Pide `content:delete` y no sólo `content:read`: es una escritura
 * irreversible. El permiso lo tiene también el operator (borrar es parte de
 * editar en este producto, ver `permissions.ts`), así que nadie pierde acceso
 * — sólo queda dicho que esto no es una lectura.
 */
export async function deleteAssistantThread(
    threadId: string,
): Promise<AssistantResult<{ id: string }>> {
    try {
        const ctx = await ctxEstratega('content:delete')
        const { error } = await orgTable(ctx, 'org_assistant_threads')
            .delete()
            .eq('id', threadId)
        if (error) throw new Error(error.message)
        return { success: true, data: { id: threadId } }
    } catch (e) {
        return fail('deleteAssistantThread', e)
    }
}

/** Lee la fila del módulo. `null` = no instalado en esta organización. */
async function leerFilaModulo(
    ctx: OrgContext,
): Promise<{ settings: unknown } | null> {
    const { data, error } = await orgTable(ctx, 'org_modules')
        .select('settings')
        .eq('module_slug', MODULE_SLUG)
        .eq('status', 'installed')
        .maybeSingle()
    if (error) throw new Error(error.message)
    return (data as { settings: unknown } | null) ?? null
}

/** Tokens y coste que el Estratega lleva cobrados hoy (UTC) a esta org. */
async function leerConsumoDeHoy(
    ctx: OrgContext,
): Promise<{ tokens: number; costUsd: number }> {
    const { data, error } = await orgTable(ctx, 'org_assistant_messages')
        .select('tokens_charged, cost_usd')
        .gte('created_at', utcDayStart(new Date()))
        .limit(USAGE_ROWS_LIMIT)
    if (error) throw new Error(error.message)
    const filas = (data ?? []) as {
        tokens_charged?: unknown
        cost_usd?: unknown
    }[]
    if (usageMaybeTruncated(filas.length)) {
        // PostgREST capa en 1000 filas EN SILENCIO: el consumo saldría MENOR
        // del real, que es el error peligroso (abre el grifo en vez de
        // cerrarlo). Sin esta línea, no habría forma de saberlo.
        console.warn(
            '[estratega] el consumo del día pudo venir truncado por PostgREST (máx. 1000 filas)',
            { organizationId: ctx.organizationId, filas: filas.length },
        )
    }
    return { tokens: sumTokensCharged(filas), costUsd: sumCostUsd(filas) }
}

/**
 * TODO lo que el widget necesita al abrirse, en una sola llamada.
 *
 * Llámalo UNA VEZ POR APERTURA del panel, no por render: acuña un reto de
 * consentimiento contra Vercel Connect (ver la cabecera del fichero).
 *
 * Con el módulo sin instalar devuelve `installed: false` con los valores por
 * defecto y SIN preguntar por Meta: el widget no debería ni pintarse, y
 * preguntar por una conexión de un módulo que no se ha comprado sería gastar
 * una llamada de red para nada.
 */
export async function getStrategistStatus(): Promise<
    AssistantResult<StrategistStatus>
> {
    try {
        const ctx = await ctxConPermiso('content:read')
        if (!(await hasModule(ctx, MODULE_SLUG))) {
            return {
                success: true,
                data: {
                    installed: false,
                    settings: { ...DEFAULT_STRATEGIST_SETTINGS },
                    meta: { connected: false },
                    canConnectMeta: ctxCan(ctx, 'connection:manage'),
                    usageToday: { tokens: 0, costUsd: 0 },
                },
            }
        }
        const [fila, usageToday, meta] = await Promise.all([
            leerFilaModulo(ctx),
            leerConsumoDeHoy(ctx),
            getMetaConnection(ctx),
        ])
        return {
            success: true,
            data: {
                installed: true,
                settings: readStrategistSettings(fila?.settings),
                meta: meta.connected
                    ? { connected: true }
                    : {
                          connected: false,
                          ...(meta.consentUrl
                              ? { consentUrl: meta.consentUrl }
                              : {}),
                      },
                canConnectMeta: ctxCan(ctx, 'connection:manage'),
                usageToday,
            },
        }
    } catch (e) {
        return fail('getStrategistStatus', e)
    }
}

/** Lo que la pantalla de ajustes puede cambiar. Todo opcional. */
export interface StrategistSettingsPatch {
    dailyTokenCap?: number
    perTurnTokenCap?: number
    mode?: StrategistSettings['mode']
}

/** Un tope válido es un entero positivo. Ni texto, ni 0, ni decimales. */
function validarTope(nombre: string, valor: unknown): number {
    if (typeof valor !== 'number' || !Number.isInteger(valor) || valor <= 0) {
        throw new Error(
            `${nombre} debe ser un número entero mayor que cero (recibido: ${String(valor)}).`,
        )
    }
    return valor
}

/**
 * Cambia los topes del módulo. Requiere `module:manage`: esto decide cuánto
 * dinero puede gastar el asistente al día.
 *
 * Se MEZCLA con lo que ya hubiera en `org_modules.settings` en vez de
 * sustituirlo: la columna es de todo el módulo, y una versión futura puede
 * haber guardado ahí claves que esta no conoce. Reescribirla entera las
 * borraría sin que nadie se enterase.
 */
export async function updateStrategistSettings(
    patch: StrategistSettingsPatch,
): Promise<AssistantResult<StrategistSettings>> {
    try {
        const ctx = await ctxEstratega('module:manage')
        const cambios: Record<string, unknown> = {}
        if (patch.dailyTokenCap !== undefined) {
            cambios.dailyTokenCap = validarTope(
                'El tope diario',
                patch.dailyTokenCap,
            )
        }
        if (patch.perTurnTokenCap !== undefined) {
            cambios.perTurnTokenCap = validarTope(
                'El tope por turno',
                patch.perTurnTokenCap,
            )
        }
        if (patch.mode !== undefined && patch.mode !== 'approve') {
            // En Fase 1 no hay herramientas que escriban: cualquier otro modo
            // sería una promesa que el código no cumple.
            throw new Error(
                'En esta versión el Estratega sólo puede funcionar en modo "approve".',
            )
        }
        if (patch.mode !== undefined) cambios.mode = 'approve'
        if (Object.keys(cambios).length === 0) {
            throw new Error('No hay nada que cambiar.')
        }

        const fila = await leerFilaModulo(ctx)
        if (!fila) {
            throw new Error(
                'El módulo "strategist" no está instalado en tu organización.',
            )
        }
        const previos =
            typeof fila.settings === 'object' &&
            fila.settings !== null &&
            !Array.isArray(fila.settings)
                ? (fila.settings as Record<string, unknown>)
                : {}
        const settings = { ...previos, ...cambios }

        // Ruling añadido en el fix-round 1 de Task 6: un tope por turno mayor
        // que el diario es una promesa vacía (el turno más caro nunca podría
        // gastarlo). Se compara sobre la versión NORMALIZADA (misma lectura
        // que hace `readStrategistSettings` para servir el estado) para que
        // basura previa en el JSON no cuele la comparación.
        const normalizado = readStrategistSettings(settings)
        if (normalizado.perTurnTokenCap > normalizado.dailyTokenCap) {
            throw new Error(
                'El tope por turno no puede superar al tope diario.',
            )
        }

        const { error } = await orgTable(ctx, 'org_modules')
            .update({ settings: settings as Json })
            .eq('module_slug', MODULE_SLUG)
        if (error) throw new Error(error.message)
        return { success: true, data: readStrategistSettings(settings) }
    } catch (e) {
        return fail('updateStrategistSettings', e)
    }
}

/**
 * Arranca (o confirma) el consentimiento de Meta para ESTE usuario.
 *
 * El sujeto del grant es la PERSONA, no la organización (decisión de Fase 0:
 * el conector sólo admite subject `user`), así que cada miembro que quiera
 * datos de anuncios pasa por aquí una vez.
 *
 * `{ connected: true }` cuando ya lo estaba: no es un error, es la respuesta
 * correcta a "conéctame" cuando ya hay grant, y el botón debe desaparecer en
 * vez de abrir una pestaña inútil.
 */
export async function startMetaConsent(): Promise<
    AssistantResult<{ connected: true } | { connected: false; url: string }>
> {
    try {
        const ctx = await ctxEstratega('connection:manage')
        const meta = await getMetaConnection(ctx)
        if (meta.connected) return { success: true, data: { connected: true } }
        if (!meta.consentUrl) {
            // Connect dijo "no hay grant" pero no acuñó reto: sin URL no hay
            // nada que abrir, y decir "ve a conectarte" sin decir a dónde es
            // peor que decir que falló.
            throw new Error(
                'Meta no devolvió una URL de consentimiento. Vuelve a intentarlo en unos segundos.',
            )
        }
        return {
            success: true,
            data: { connected: false, url: meta.consentUrl },
        }
    } catch (e) {
        return fail('startMetaConsent', e)
    }
}
