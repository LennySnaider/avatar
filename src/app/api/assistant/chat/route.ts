/**
 * F5.2 (Estratega) Task 4 — `POST /api/assistant/chat`: EL TURNO del agente
 * de IA de la ORGANIZACIÓN (no del avatar; eso es `/api/agent/chat`).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CONTRATO DE CABLE (lo que el widget de la Task 5 puede dar por hecho)
 * ─────────────────────────────────────────────────────────────────────────
 * PETICIÓN — `POST /api/assistant/chat`, JSON:
 *     {
 *       messages: UIMessage[],   // obligatorio, no vacío, el ÚLTIMO de rol 'user'
 *       threadId?: string,       // ausente = abre hilo nuevo
 *       screen?: AssistantScreen // desconocida ⇒ 'other' (nunca es un 400)
 *     }
 * Es exactamente lo que produce `useChat` de `@ai-sdk/react` v3 con
 * `new DefaultChatTransport({ api: '/api/assistant/chat', body: { threadId,
 * screen } })`: el transporte pone `messages` y el `body` añade los otros dos.
 *
 * RESPUESTA — flujo SSE de UI messages (`toUIMessageStreamResponse`). En el
 * chunk `start` (el PRIMERO, antes de cualquier texto) viajan los metadatos:
 *     { threadId: string, model: string, consentUrl?: string }
 *  - `threadId`: SIEMPRE. En un hilo nuevo es el id recién creado, y el
 *    widget debe ADOPTARLO para que el siguiente mensaje continúe el mismo
 *    hilo en vez de abrir otro. Llega en `start` justo por eso: si viajara
 *    sólo en `finish`, un usuario que escribe dos veces seguidas antes de que
 *    termine el primer turno abriría dos hilos.
 *  - `consentUrl`: sólo cuando Meta NO está conectado Y Connect llegó a
 *    acuñar el reto. Es lo que pinta la tarjeta "Conectar Meta". Su AUSENCIA
 *    no significa "conectado" — eso lo dice que no venga el campo junto con
 *    un `getStrategistStatus()` que diga `meta.connected`.
 *  - `model`: el modelo que se usó; `null` en las dos respuestas que NO pasan
 *    por el modelo (tope diario y sin tokens).
 *
 * ERRORES — JSON, nunca SSE:
 *     401 { error }                      sin sesión / sin membresía
 *     403 { error: 'module_not_installed', message }  módulo no instalado
 *     403 { error }                      el rol no puede
 *     400 { error }                      cuerpo inválido
 *     404 { error }                      threadId que no es de esta org
 *     500 { error }                      avería (mensaje genérico; el detalle
 *                                        va al log con ids, nunca al cliente)
 *
 * DOS RESPUESTAS QUE SON 200 Y NO GASTAN MODELO (llegan como un mensaje del
 * asistente normal y corriente, para que el widget no necesite un camino
 * aparte): tope diario agotado y saldo insuficiente. Se persisten igual que
 * cualquier otro turno, con `tokens_charged: 0`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ORDEN DE LAS OPERACIONES, Y POR QUÉ ESE
 * ─────────────────────────────────────────────────────────────────────────
 *  1. Validar el cuerpo (barato, sin I/O).
 *  2. `getOrgContext` → `requireModule('strategist')` → `requirePermission`.
 *  3. Resolver el hilo (o crearlo) y PERSISTIR EL MENSAJE DEL USUARIO antes
 *     de contestar: si el turno revienta a mitad, la pregunta no se pierde.
 *  4. Presupuesto diario. Si no queda, se contesta sin herramientas y SIN
 *     HOLD: cobrar por decir "no te queda presupuesto" sería sangrante.
 *  5. Hold (techo de `perTurnTokenCap`).
 *  6. Herramientas: registro propio + (si procede) la lista blanca del MCP.
 *  7. Contexto del prompt y `streamText`.
 * Todo lo que va DESPUÉS del hold está envuelto para reembolsar si algo
 * revienta: un hold sin turno deja tokens reservados que sólo el barrido de
 * holds rancios devolvería, horas después.
 *
 * EL MCP SE CIERRA SIEMPRE, por los tres caminos (`onFinish`, `onError` y el
 * `catch` de la ruta) y con un pestillo para que cerrarlo dos veces no sea un
 * error. Dejarlo abierto filtra una conexión HTTP por turno.
 */
import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
    convertToModelMessages,
    createUIMessageStream,
    createUIMessageStreamResponse,
    stepCountIs,
    streamText,
    type ToolSet,
    type UIMessage,
} from 'ai'
import { getOrgContext, type OrgContext } from '@/lib/tenant/getOrgContext'
import { isExpectedDenial, requirePermission } from '@/lib/org/guards'
import {
    ModuleNotInstalledError,
    requireModule,
} from '@/lib/modules/entitlements'
import { orgInsert, orgTable } from '@/lib/org/orgTable'
import { readOrgName } from '@/lib/org/membersDb'
import { getChatModel } from '@/lib/agent/chatProvider'
import { insufficientTokensMessage } from '@/lib/billing/wallet'
import type { Hold } from '@/lib/billing/wallet'
import { ASSISTANT_TOOL_MODEL } from '@/lib/assistant/models'
import {
    holdAssistantTurn,
    refundAssistantTurn,
    settleAssistantTurn,
} from '@/lib/assistant/billing'
import { budgetAllows, readStrategistSettings } from '@/lib/assistant/budget'
import { selectTools, toAiTools } from '@/lib/assistant/registry'
import { READ_TOOLS } from '@/lib/assistant/tools'
import { fetchAvatarsOverview } from '@/lib/assistant/tools/read/avatars'
import { buildStrategistSystemPrompt } from '@/lib/assistant/systemPrompt'
import {
    getMetaConnection,
    type MetaConnection,
} from '@/lib/assistant/meta/connect'
import { openMetaMcpTools } from '@/lib/assistant/meta/mcp'
import { parseChatBody } from '@/lib/assistant/route/validate'
import { deriveThreadTitle } from '@/lib/assistant/route/threadTitle'
import {
    USAGE_ROWS_LIMIT,
    sumTokensCharged,
    usageMaybeTruncated,
    utcDayStart,
} from '@/lib/assistant/route/usage'
import type { AssistantScreen } from '@/lib/assistant/types'
import type { Json } from '@/@types/database.generated'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Pantallas donde se abre el MCP de Meta. Fase 0: el catálogo entero son 95
 * herramientas y ~170k caracteres de esquema que se pagan EN CADA TURNO; ni
 * siquiera con la lista blanca merece la pena abrir la conexión desde el
 * estudio o el inbox, donde nadie pregunta por anuncios.
 */
const MCP_SCREENS: readonly AssistantScreen[] = [
    'social-accounts',
    'social-posts',
    'other',
]

/** Metadatos que viajan al cliente en el chunk `start`. Ver el contrato arriba. */
interface AssistantMetadata {
    threadId: string
    model: string | null
    consentUrl?: string
}

/** Lo que `settleAssistantTurn` necesita del hold, más el id para el log. */
type HoldRef = Pick<Hold, 'holdId' | 'tokens'>

const json = (body: unknown, status: number) =>
    NextResponse.json(body, { status })

/**
 * Respuesta SSE de UN SOLO mensaje del asistente, sin pasar por el modelo.
 *
 * Es el formato de las dos paradas de presupuesto. Va por el MISMO canal que
 * un turno normal a propósito: el widget no necesita un camino especial, y el
 * mensaje queda en el hilo como cualquier otro.
 */
function respuestaDeTexto(text: string, metadata: AssistantMetadata): Response {
    const stream = createUIMessageStream<UIMessage<AssistantMetadata>>({
        execute({ writer }) {
            const id = 'aviso'
            writer.write({ type: 'start', messageMetadata: metadata })
            writer.write({ type: 'text-start', id })
            writer.write({ type: 'text-delta', id, delta: text })
            writer.write({ type: 'text-end', id })
            writer.write({ type: 'finish' })
        },
    })
    return createUIMessageStreamResponse({ stream })
}

/**
 * ¿Está Meta conectado para este usuario?
 *
 * `getMetaConnection` propaga a propósito todo lo que NO sea falta de
 * consentimiento (Connect caído, conector mal configurado, sin token OIDC en
 * local). Aquí ese fallo se degrada a "no conectado, sin URL" CON su
 * `console.error`: Meta enriquece el turno, no lo define, y una avería de la
 * plataforma de conectores no puede dejar sin asistente a quien sólo quería
 * saber cómo va su Instagram. El log es lo que impide que esto sea un fallo
 * silencioso.
 */
async function resolverMeta(ctx: OrgContext): Promise<MetaConnection> {
    try {
        return await getMetaConnection(ctx)
    } catch (e) {
        console.error('[estratega] no se pudo comprobar la conexión con Meta', {
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            error: e instanceof Error ? e.message : String(e),
        })
        return { connected: false, consentUrl: null }
    }
}

/**
 * Nombre de la organización para el prompt. `readOrgName` ya loguea y devuelve
 * `null` si no se pudo leer; aquí sólo se elige el texto de reserva, porque un
 * prompt sin nombre de organización sigue siendo un prompt útil.
 */
async function leerNombreOrg(ctx: OrgContext): Promise<string> {
    return (await readOrgName(ctx.organizationId)) ?? 'tu organización'
}

/** Ajustes del módulo `strategist` de esta org, ya normalizados. */
async function leerAjustes(ctx: OrgContext) {
    const { data, error } = await orgTable(ctx, 'org_modules')
        .select('settings')
        .eq('module_slug', 'strategist')
        .eq('status', 'installed')
        .maybeSingle()
    if (error) {
        // No se tumba el turno: sin ajustes legibles se usan los defaults,
        // que son MÁS restrictivos que cualquier tope que una org se suba.
        console.error(
            '[estratega] no se pudieron leer los ajustes del módulo',
            {
                organizationId: ctx.organizationId,
                error: error.message,
            },
        )
        return readStrategistSettings(null)
    }
    return readStrategistSettings(
        (data as { settings?: unknown } | null)?.settings,
    )
}

/**
 * Tokens que el Estratega ya cobró HOY (UTC) a esta organización.
 *
 * Se suman las filas en vez de pedirle la suma a PostgREST porque el
 * agregado no está garantizado en todas las versiones; el precio es la
 * truncación silenciosa a 1000 filas, que `usageMaybeTruncated` convierte en
 * un aviso visible (ver `route/usage.ts`).
 */
async function leerConsumoDeHoy(ctx: OrgContext, now: Date): Promise<number> {
    const { data, error } = await orgTable(ctx, 'org_assistant_messages')
        .select('tokens_charged')
        .gte('created_at', utcDayStart(now))
        .limit(USAGE_ROWS_LIMIT)
    if (error) {
        // Un contador ilegible NO puede bloquear: `budgetAllows` trata el 0
        // como "no ha gastado nada", y el tope POR TURNO sigue en pie.
        console.error('[estratega] no se pudo leer el consumo del día', {
            organizationId: ctx.organizationId,
            error: error.message,
        })
        return 0
    }
    const filas = (data ?? []) as { tokens_charged?: unknown }[]
    if (usageMaybeTruncated(filas.length)) {
        console.warn(
            '[estratega] el consumo del día pudo venir truncado por PostgREST (máx. 1000 filas): el tope diario podría estar midiendo de menos',
            { organizationId: ctx.organizationId, filas: filas.length },
        )
    }
    return sumTokensCharged(filas)
}

/** Guarda una fila de `org_assistant_messages`. Nunca lanza. */
async function guardarMensaje(
    ctx: OrgContext,
    fila: {
        id?: string
        threadId: string
        role: 'user' | 'assistant'
        content: unknown
        model?: string | null
        inputTokens?: number | null
        outputTokens?: number | null
        tokensCharged?: number
        costUsd?: number | null
        holdId?: string | null
    },
): Promise<void> {
    const { error } = await orgInsert(ctx, 'org_assistant_messages', {
        ...(fila.id ? { id: fila.id } : {}),
        thread_id: fila.threadId,
        role: fila.role,
        content: fila.content as Json,
        model: fila.model ?? null,
        input_tokens: fila.inputTokens ?? null,
        output_tokens: fila.outputTokens ?? null,
        tokens_charged: fila.tokensCharged ?? 0,
        cost_usd: fila.costUsd ?? null,
        hold_id: fila.holdId ?? null,
    })
    if (error) {
        // El turno YA se le está entregando al usuario: reventar aquí le
        // costaría la respuesta. Se registra y se sigue.
        console.error('[estratega] no se pudo persistir el mensaje', {
            organizationId: ctx.organizationId,
            threadId: fila.threadId,
            role: fila.role,
            error: error.message,
        })
    }
}

/** Marca el hilo como tocado para que la lista lo ordene bien. */
async function tocarHilo(ctx: OrgContext, threadId: string): Promise<void> {
    const { error } = await orgTable(ctx, 'org_assistant_threads')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', threadId)
    if (error) {
        console.error('[estratega] no se pudo actualizar updated_at del hilo', {
            organizationId: ctx.organizationId,
            threadId,
            error: error.message,
        })
    }
}

/**
 * Las `parts` con las que se guarda la respuesta del asistente.
 *
 * El texto va como parte `text` (lo que el widget pinta) y las herramientas
 * usadas como una parte de datos `data-tools`: es un tipo de parte VÁLIDO del
 * AI SDK, así que un renderizador de `UIMessage` no se atraganta con ella, y
 * a la vez deja por escrito de dónde salieron las cifras del turno. NO se
 * guarda la SALIDA de las herramientas: puede ser enorme y ya está resumida
 * en el texto.
 */
function partesDeRespuesta(
    text: string,
    herramientas: { toolName: string; input: unknown }[],
): unknown[] {
    const parts: unknown[] = [{ type: 'text', text }]
    if (herramientas.length > 0) {
        parts.push({ type: 'data-tools', data: herramientas })
    }
    return parts
}

export async function POST(req: NextRequest) {
    // ── 1. Cuerpo ────────────────────────────────────────────────────────
    let crudo: unknown
    try {
        crudo = await req.json()
    } catch {
        return json(
            { error: 'El cuerpo de la petición no es JSON válido.' },
            400,
        )
    }
    const parsed = parseChatBody(crudo)
    if (!parsed.ok) return json({ error: parsed.error }, 400)
    const { messages, screen } = parsed

    // ── 2. Quién pregunta ────────────────────────────────────────────────
    let ctx: OrgContext
    try {
        ctx = await getOrgContext()
    } catch (e) {
        // `getOrgContext` lanza por dos motivos (sin sesión / sin membresía);
        // los dos son "no puedes pasar" en una ruta de API.
        return json(
            { error: e instanceof Error ? e.message : 'Not authenticated' },
            401,
        )
    }
    try {
        await requireModule(ctx, 'strategist')
        requirePermission(ctx, 'content:read')
    } catch (e) {
        if (e instanceof ModuleNotInstalledError) {
            return json(
                { error: 'module_not_installed', message: e.message },
                403,
            )
        }
        if (isExpectedDenial(e)) {
            return json(
                { error: e instanceof Error ? e.message : 'Forbidden' },
                403,
            )
        }
        console.error('[estratega] fallo comprobando módulo/permiso', {
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            error: e instanceof Error ? e.message : String(e),
        })
        return json(
            { error: 'No se pudo comprobar el acceso al Estratega.' },
            500,
        )
    }

    /** Pestillo: el cliente MCP se cierra una vez, la llamen los que la llamen. */
    let cerrarMcp: (() => Promise<void>) | null = null
    const cerrarMcpUnaVez = async () => {
        const cerrar = cerrarMcp
        cerrarMcp = null
        if (!cerrar) return
        try {
            await cerrar()
        } catch (e) {
            console.error('[estratega] fallo al cerrar el cliente MCP', {
                organizationId: ctx.organizationId,
                error: e instanceof Error ? e.message : String(e),
            })
        }
    }

    let hold: HoldRef | null = null
    try {
        // ── 3. Hilo + mensaje del usuario ────────────────────────────────
        const ultimo = messages[messages.length - 1]
        let threadId: string
        if (parsed.threadId) {
            const { data, error } = await orgTable(ctx, 'org_assistant_threads')
                .select('id')
                .eq('id', parsed.threadId)
                .maybeSingle()
            if (error) throw new Error(`lectura del hilo: ${error.message}`)
            // Fuera de la org el hilo sencillamente no existe: 404, no 403 —
            // un 403 confirmaría que ese id existe en OTRA organización.
            if (!data) return json({ error: 'Ese hilo no existe.' }, 404)
            threadId = parsed.threadId
        } else {
            const { data, error } = await orgInsert(
                ctx,
                'org_assistant_threads',
                {
                    title: deriveThreadTitle(ultimo.parts),
                    created_by: ctx.userId,
                    screen,
                },
            )
                .select('id')
                .single()
            if (error) throw new Error(`creación del hilo: ${error.message}`)
            threadId = (data as { id: string }).id
        }
        await guardarMensaje(ctx, {
            threadId,
            role: 'user',
            content: ultimo.parts,
        })

        // ── 4. Presupuesto del día ───────────────────────────────────────
        const ahora = new Date()
        const settings = await leerAjustes(ctx)
        const usedToday = await leerConsumoDeHoy(ctx, ahora)
        const presupuesto = budgetAllows({
            usedToday,
            dailyCap: settings.dailyTokenCap,
        })
        const meta = await resolverMeta(ctx)
        const consentUrl =
            !meta.connected && meta.consentUrl ? meta.consentUrl : undefined

        if (!presupuesto.allowed) {
            const texto =
                `Hoy ya se ha consumido el presupuesto de tokens del Estratega en esta organización ` +
                `(${usedToday.toLocaleString('es-ES')} de ${settings.dailyTokenCap.toLocaleString('es-ES')} tokens). ` +
                `Se renueva a las 00:00 UTC. Si necesitas más, un administrador puede subir el tope diario en Módulos → Estratega.`
            console.warn('[estratega] tope diario agotado', {
                organizationId: ctx.organizationId,
                usedToday,
                dailyCap: settings.dailyTokenCap,
            })
            await guardarMensaje(ctx, {
                threadId,
                role: 'assistant',
                content: partesDeRespuesta(texto, []),
            })
            await tocarHilo(ctx, threadId)
            return respuestaDeTexto(texto, {
                threadId,
                model: null,
                consentUrl,
            })
        }

        // ── 5. Hold ──────────────────────────────────────────────────────
        // El id del mensaje del asistente se genera AQUÍ porque es la clave de
        // idempotencia del hold (`assistant:${messageId}`): un reintento del
        // mismo turno tiene que reusar el hold, no abrir otro.
        const assistantMessageId = randomUUID()
        const holdResult = await holdAssistantTurn(ctx, {
            threadId,
            messageId: assistantMessageId,
            maxTokens: settings.perTurnTokenCap,
        })
        if (!holdResult.ok) {
            // Sólo ocurre con ENFORCE_LIMITS encendido: en measure-only el
            // hold siempre pasa.
            const texto = insufficientTokensMessage({
                required: holdResult.required,
                available: holdResult.available,
            })
            await guardarMensaje(ctx, {
                id: assistantMessageId,
                threadId,
                role: 'assistant',
                content: partesDeRespuesta(texto, []),
            })
            await tocarHilo(ctx, threadId)
            return respuestaDeTexto(texto, {
                threadId,
                model: null,
                consentUrl,
            })
        }
        hold = holdResult.hold

        // ── 6. Herramientas ──────────────────────────────────────────────
        const propias = toAiTools(
            selectTools(READ_TOOLS, { role: ctx.role, screen }),
            {
                ctx,
            },
        )
        let tools: ToolSet = propias
        if (meta.connected && MCP_SCREENS.includes(screen)) {
            const mcp = await openMetaMcpTools(ctx)
            if (mcp.ok) {
                cerrarMcp = mcp.close
                // Una sola línea por turno con lo que cuesta el catálogo: es
                // el dato que permite decidir si la lista blanca se queda
                // como está o hay que recortarla más.
                console.log('[estratega] mcp', {
                    organizationId: ctx.organizationId,
                    screen,
                    toolCount: mcp.toolCount,
                    exposedCount: mcp.exposedCount,
                    schemaChars: mcp.schemaChars,
                })
                // Las propias van DESPUÉS: si el MCP sirviera un nombre que
                // choca con uno nuestro, gana el nuestro (el que sabemos qué
                // hace y a qué organización lee).
                tools = { ...mcp.tools, ...propias }
            }
        }

        // ── 7. Contexto y modelo ─────────────────────────────────────────
        const [orgName, avatares] = await Promise.all([
            leerNombreOrg(ctx),
            fetchAvatarsOverview(ctx),
        ])
        const system = buildStrategistSystemPrompt({
            orgName,
            avatars: avatares.map((a) => ({
                name: a.name,
                platforms: a.platforms,
                aiOn: a.aiPersonaEnabled,
            })),
            screen,
            hasMeta: meta.connected,
            today: utcDayStart(ahora).slice(0, 10),
        })

        const holdDelTurno = hold
        let turnoCerrado = false
        const result = streamText({
            model: getChatModel({
                provider: 'gemini',
                model: ASSISTANT_TOOL_MODEL,
            }),
            system,
            messages: await convertToModelMessages(messages),
            tools,
            stopWhen: stepCountIs(6),
            onFinish: async ({ totalUsage, text, steps }) => {
                if (turnoCerrado) return
                turnoCerrado = true
                try {
                    // `totalUsage` y no `usage`: `usage` es el del ÚLTIMO paso,
                    // y un turno con herramientas tiene varios — cobrar sólo
                    // el último regalaría todo lo anterior.
                    const cobro = await settleAssistantTurn(
                        holdDelTurno,
                        {
                            inputTokens: totalUsage.inputTokens,
                            outputTokens: totalUsage.outputTokens,
                        },
                        ASSISTANT_TOOL_MODEL,
                        { ctx },
                    )
                    const herramientas = steps.flatMap((s) =>
                        s.toolCalls.map((c) => ({
                            toolName: c.toolName,
                            input: c.input,
                        })),
                    )
                    await guardarMensaje(ctx, {
                        id: assistantMessageId,
                        threadId,
                        role: 'assistant',
                        content: partesDeRespuesta(text, herramientas),
                        model: ASSISTANT_TOOL_MODEL,
                        inputTokens: totalUsage.inputTokens ?? null,
                        outputTokens: totalUsage.outputTokens ?? null,
                        tokensCharged: cobro.tokens,
                        costUsd: cobro.costUsd,
                        holdId: holdDelTurno.holdId,
                    })
                    await tocarHilo(ctx, threadId)
                } catch (e) {
                    console.error(
                        '[estratega] fallo liquidando/persistiendo el turno',
                        {
                            organizationId: ctx.organizationId,
                            threadId,
                            messageId: assistantMessageId,
                            holdId: holdDelTurno.holdId,
                            error: e instanceof Error ? e.message : String(e),
                        },
                    )
                } finally {
                    await cerrarMcpUnaVez()
                }
            },
            onError: async ({ error }) => {
                if (turnoCerrado) return
                turnoCerrado = true
                console.error(
                    '[estratega] el turno falló durante el streaming',
                    {
                        organizationId: ctx.organizationId,
                        threadId,
                        messageId: assistantMessageId,
                        holdId: holdDelTurno.holdId,
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                )
                try {
                    await refundAssistantTurn(
                        holdDelTurno,
                        'assistant_turn_failed',
                        {
                            ctx,
                        },
                    )
                } finally {
                    await cerrarMcpUnaVez()
                }
            },
        })

        // A partir de aquí el hold lo cierran `onFinish`/`onError`: el catch
        // de abajo ya no debe reembolsarlo.
        hold = null

        const metadata: AssistantMetadata = {
            threadId,
            model: ASSISTANT_TOOL_MODEL,
            consentUrl,
        }
        return result.toUIMessageStreamResponse({
            // Sólo en `start`: es el primer chunk, y ahí es donde el widget
            // adopta el threadId (ver el contrato de cable arriba).
            messageMetadata: ({ part }) =>
                part.type === 'start' ? metadata : undefined,
            // Genérico A PROPÓSITO: los errores de Connect/Meta pueden traer
            // URLs con credenciales dentro. El detalle va al log.
            onError: () => 'El Estratega no pudo terminar la respuesta.',
        })
    } catch (e) {
        console.error('[estratega] fallo preparando el turno', {
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            screen,
            error: e instanceof Error ? e.message : String(e),
        })
        if (hold) {
            await refundAssistantTurn(hold, 'assistant_turn_setup_failed', {
                ctx,
            })
        }
        await cerrarMcpUnaVez()
        return json(
            { error: 'El Estratega no pudo responder. Inténtalo de nuevo.' },
            500,
        )
    }
}
