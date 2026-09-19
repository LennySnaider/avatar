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
 *  - `consentUrl`: sólo cuando el turno PUEDE usar Meta (tiene herramientas
 *    de Meta en su catálogo), Meta NO está conectado, Connect llegó a acuñar
 *    el reto Y quien pregunta tiene `connection:manage` — es quien podría
 *    completar el grant (`startMetaConsent` exige ese permiso). Es lo que
 *    pinta la tarjeta "Conectar Meta". Su AUSENCIA no significa "conectado":
 *    eso lo dice `getStrategistStatus()`, que además responde `canConnectMeta`
 *    para que la UI sepa si pintar el botón o pedir un administrador.
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
 *  6. Herramientas: registro propio y, SÓLO si el turno tiene alguna
 *     herramienta de Meta que llamar, la conexión con Meta (que acuña reto,
 *     así que no se pregunta por gusto) + la lista blanca del MCP.
 *  7. Contexto del prompt y `streamText`.
 * Todo lo que va DESPUÉS del hold está envuelto para reembolsar si algo
 * revienta: un hold sin turno deja tokens reservados que sólo el barrido de
 * holds rancios devolvería, horas después.
 *
 * EL MCP SE CIERRA SIEMPRE, por los cuatro caminos (`onFinish`, `onError`,
 * `onAbort` y el `catch` de la ruta) y con un pestillo para que cerrarlo dos
 * veces no sea un error. Dejarlo abierto filtra una conexión HTTP por turno.
 *
 * EL TURNO TERMINA AUNQUE EL CLIENTE SE VAYA. Si el navegador se desengancha
 * a mitad de la respuesta, el SDK ejecuta `cancel()` y NO dispara `onFinish`
 * ni `onError`: el hold se quedaría abierto, el mensaje sin guardar y el MCP
 * sin cerrar. Dos piezas lo cubren: `consumeStream()` drena el flujo desde el
 * servidor (el turno llega a su final pase lo que pase al otro lado), y
 * `abortSignal: req.signal` + `onAbort` cierran el turno devolviendo el hold
 * cuando quien aborta es la petición entera (cierre de pestaña, timeout de la
 * plataforma).
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
import { ctxCan, isExpectedDenial, requirePermission } from '@/lib/org/guards'
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
import {
    READ_TOOLS,
    getMetaAdAccountInsights,
    listMetaAdAccounts,
} from '@/lib/assistant/tools'
import { fetchAvatarsOverview } from '@/lib/assistant/tools/read/avatars'
import { buildStrategistSystemPrompt } from '@/lib/assistant/systemPrompt'
import {
    getMetaConnection,
    type MetaConnection,
} from '@/lib/assistant/meta/connect'
import { META_MCP_READ_TOOLS, openMetaMcpTools } from '@/lib/assistant/meta/mcp'
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
/**
 * 120 y no 60: Fase 0 midió un turno con MCP en ~30 s con 8 pasos, y este
 * turno puede encadenar 6 pasos con MCP, Graph y Upload-Post por medio. A los
 * 60 s la plataforma cortaba la petición a mitad de respuesta (el turno se
 * cierra bien —`onAbort` devuelve el hold— pero el usuario se queda sin
 * respuesta). El resto del repo ya usa 120.
 */
export const maxDuration = 120

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

/**
 * Los nombres de TODAS las herramientas que leen de Meta, por las dos vías
 * (Graph API directa y lista blanca del MCP). Se usa para decidir el
 * `hasMeta` del prompt: es lo que hay en el catálogo del turno, no lo que hay
 * en la cuenta del usuario. Los nombres se toman de sus definiciones para que
 * renombrar una herramienta no deje esta lista mintiendo en silencio.
 */
const NOMBRES_META = new Set<string>([
    listMetaAdAccounts.name,
    getMetaAdAccountInsights.name,
    ...META_MCP_READ_TOOLS,
])

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
        // `||` y no `??`: en measure-only, `wallet.ts` devuelve un hold con
        // `holdId: ''` cuando la RPC falla y se deja pasar. Con `??` esa
        // cadena vacía llegaría a la columna `uuid` y PostgREST tumbaría el
        // insert entero ("invalid input syntax for type uuid"), perdiendo la
        // fila del turno — y el error sólo quedaría en el log de más abajo.
        hold_id: fila.holdId || null,
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
            {
                error: 'No se pudo comprobar el acceso al Social Media Manager.',
            },
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

        if (!presupuesto.allowed) {
            const texto =
                `Hoy ya se ha consumido el presupuesto de tokens del Social Media Manager en esta organización ` +
                `(${usedToday.toLocaleString('es-ES')} de ${settings.dailyTokenCap.toLocaleString('es-ES')} tokens de saldo). ` +
                `Se renueva a las 00:00 UTC. Si necesitas más, un administrador puede subir el tope diario en Módulos → Social Media Manager.`
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
            // Sin `consentUrl`: este turno se corta ANTES de preguntarle a
            // Connect por el grant de Meta (ver la sección 6), y acuñar un
            // reto para un turno que ni siquiera va a llamar al modelo sería
            // una llamada de red con efecto a cambio de nada.
            return respuestaDeTexto(texto, { threadId, model: null })
        }

        // ── 5. Hold ──────────────────────────────────────────────────────
        // El id del mensaje del asistente se genera AQUÍ porque es la clave de
        // idempotencia del hold (`assistant:${messageId}`): un reintento del
        // mismo turno tiene que reusar el hold, no abrir otro.
        const assistantMessageId = randomUUID()
        // `maxTokens` va en TOKENS DE MONEDERO (`org_wallets`), que es la
        // unidad que `wallet_hold` aparta del saldo — NO son los tokens que
        // factura Gemini. 1 token de monedero = 0,001 USD a precio de cliente
        // (`tokensForCostUsd` en `@/lib/billing/catalog`), y en measure-only
        // el hold debita igual. Por eso los defaults de `budget.ts` están en
        // esa unidad y son pequeños (200 por turno, 2 500 al día).
        //
        // OJO CON EL PERMISO: `holdForOperation` exige `generation:create`
        // (ver `wallet.ts`), que NO es el `content:read` que guarda esta ruta.
        // Hoy lo tienen los tres roles, así que nadie lo nota; el día que
        // entre un rol de sólo lectura, el turno le fallará EXACTAMENTE aquí
        // —con una excepción que cae en el catch de abajo y sale como un 500
        // genérico—, no en el guard de arriba.
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
            // Sin `consentUrl`, por lo mismo que la parada de presupuesto.
            return respuestaDeTexto(texto, { threadId, model: null })
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

        // ¿PUEDE este turno llamar a Meta? Por Graph (una herramienta propia
        // ya seleccionada para esta pantalla) o por el MCP (que sólo se abre
        // en `MCP_SCREENS`). Si no, no se le pregunta a Connect por el grant:
        // `getMetaConnection` en modo `eager` ACUÑA un reto de consentimiento
        // —es una llamada de red con efecto, no un `select`— y hacerlo en
        // cada turno del estudio o del inbox es pagar por un dato que este
        // turno no va a usar. Por eso vive aquí y no antes del corte por tope
        // diario: un turno que no llega al modelo tampoco necesita saberlo.
        const turnoPuedeUsarMeta =
            Object.keys(propias).some((n) => NOMBRES_META.has(n)) ||
            MCP_SCREENS.includes(screen)
        const meta: MetaConnection = turnoPuedeUsarMeta
            ? await resolverMeta(ctx)
            : { connected: false, consentUrl: null }

        // La URL de consentimiento SÓLO viaja a quien puede completar el
        // grant: `startMetaConsent` exige `connection:manage`, así que
        // dársela a un operator sería mandarlo a una pantalla de Meta cuya
        // vuelta termina en un rechazo (y, si la abriera igualmente, un rol
        // que no puede conectar cuentas acabaría conectando la de la
        // organización). Que Meta esté o no conectado se sigue diciendo por
        // el prompt y por `getStrategistStatus`; lo que se calla es el botón.
        const consentUrl =
            !meta.connected &&
            meta.consentUrl &&
            ctxCan(ctx, 'connection:manage')
                ? meta.consentUrl
                : undefined

        if (meta.connected && MCP_SCREENS.includes(screen)) {
            // `openMetaMcpTools` RELANZA todo lo que no sea falta de
            // consentimiento (un 5xx de mcp.facebook.com, un fallo de
            // transporte, el servidor de Meta caído). Sin este try eso mataría
            // el turno ENTERO con un 500 — también las preguntas que no
            // necesitaban Meta para nada, que son la mayoría. El MCP es un
            // extra del turno, no su condición: misma degradación que
            // `resolverMeta` aplica a la comprobación de conexión, y con el
            // mismo precio, un `console.error` que deje la causa por escrito.
            try {
                const mcp = await openMetaMcpTools(ctx)
                if (mcp.ok) {
                    cerrarMcp = mcp.close
                    // Una sola línea por turno con lo que cuesta el catálogo:
                    // es el dato que permite decidir si la lista blanca se
                    // queda como está o hay que recortarla más.
                    console.log('[estratega] mcp', {
                        organizationId: ctx.organizationId,
                        screen,
                        toolCount: mcp.toolCount,
                        exposedCount: mcp.exposedCount,
                        schemaChars: mcp.schemaChars,
                    })
                    // Las propias van DESPUÉS: si el MCP sirviera un nombre
                    // que choca con uno nuestro, gana el nuestro (el que
                    // sabemos qué hace y a qué organización lee).
                    tools = { ...mcp.tools, ...propias }
                }
            } catch (e) {
                console.error(
                    '[estratega] mcp no disponible',
                    { organizationId: ctx.organizationId, screen },
                    e instanceof Error ? e.message : String(e),
                )
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
            // `hasMeta` no es "¿hay grant?", es "¿tiene ESTE turno alguna
            // herramienta de Meta que llamar?". La diferencia importa en los
            // dos sentidos:
            //  - Si el MCP se cayó pero las herramientas de Graph siguen en el
            //    catálogo (viven en otro host y en las MISMAS pantallas), el
            //    turno sigue pudiendo leer anuncios: decir "Meta no está
            //    conectado" mandaría al usuario a conectar algo que ya tiene
            //    conectado, que es justo el fallo que el prompt evita
            //    escribiendo una sola de las dos frases.
            //  - En una pantalla sin herramientas de Meta (inbox, estudio,
            //    módulos) el grant existe pero no hay nada que llamar, y
            //    prometerlo haría que el modelo ofreciera datos que no puede
            //    traer.
            hasMeta:
                meta.connected &&
                Object.keys(tools).some((n) => NOMBRES_META.has(n)),
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
            // La petición abortada (el navegador se va, el usuario cierra el
            // cajón, Vercel corta al llegar a `maxDuration`) tiene que llegar
            // hasta aquí para que `onAbort` pueda cerrar el turno; sin señal,
            // el SDK seguiría pidiéndole tokens a Gemini para una respuesta
            // que ya no lee nadie.
            abortSignal: req.signal,
            onAbort: async () => {
                if (turnoCerrado) return
                turnoCerrado = true
                console.warn('[estratega] turno abortado por el cliente', {
                    organizationId: ctx.organizationId,
                    threadId,
                    messageId: assistantMessageId,
                    holdId: holdDelTurno.holdId,
                })
                try {
                    // Se DEVUELVE el hold entero aunque el proveedor ya haya
                    // facturado los pasos hechos: el usuario no se quedó con
                    // ninguna respuesta, y cobrarle un turno que canceló es
                    // peor que asumir el coste parcial. En measure-only esto
                    // hoy no mueve saldo real.
                    await refundAssistantTurn(
                        holdDelTurno,
                        'assistant_turn_aborted',
                        { ctx },
                    )
                } finally {
                    await cerrarMcpUnaVez()
                }
            },
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
                    // `text` del evento es el del ÚLTIMO paso (`OnFinishEvent`
                    // extiende el `StepResult` final): un turno que escribe
                    // algo, llama a una herramienta y sigue escribiendo se
                    // guardaría A MEDIAS, y el hilo recargado no coincidiría
                    // con lo que el usuario acaba de leer en pantalla. Se
                    // concatena lo de TODOS los pasos, que es justo lo que el
                    // stream le fue entregando.
                    const textoCompleto = steps
                        .map((s) => s.text)
                        .filter((t) => t.length > 0)
                        .join('\n\n')
                    await guardarMensaje(ctx, {
                        id: assistantMessageId,
                        threadId,
                        role: 'assistant',
                        content: partesDeRespuesta(
                            textoCompleto.length > 0 ? textoCompleto : text,
                            herramientas,
                        ),
                        model: ASSISTANT_TOOL_MODEL,
                        inputTokens: totalUsage.inputTokens ?? null,
                        outputTokens: totalUsage.outputTokens ?? null,
                        tokensCharged: cobro.tokens,
                        costUsd: cobro.costUsd,
                        holdId: holdDelTurno.holdId,
                    })
                    await tocarHilo(ctx, threadId)
                } catch (e) {
                    // NO se reembolsa aquí, y es deliberado: este catch cubre
                    // dos cosas muy distintas —el settle falló, o falló el
                    // guardado DESPUÉS de un settle correcto— y desde aquí no
                    // se distinguen. Un refund a ciegas sobre un hold ya
                    // liquidado regalaría el turno que el usuario sí recibió.
                    // Un hold que se quedara abierto no se pierde: lo devuelve
                    // el barrido de holds rancios (`sweepStaleHolds`), que es
                    // exactamente para lo que existe.
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

        // EL DRENADO DEL SERVIDOR. Si el cliente se desengancha a mitad de la
        // respuesta (cierra el cajón, cambia de página, se le va la red), el
        // SDK ejecuta `cancel()` en vez de `flush()` y NO dispara ni
        // `onFinish` ni `onError`: el hold se quedaría sin liquidar ni
        // devolver, el mensaje del asistente sin guardar y el cliente MCP
        // abierto. `consumeStream()` vacía el flujo desde el servidor, así que
        // el turno llega a su final y sus callbacks corren pase lo que pase al
        // otro lado del cable. Sin `await` a propósito: el turno tiene que
        // seguir vivo DESPUÉS de que esta función devuelva la respuesta.
        void result.consumeStream({
            // El drenado no puede quedar como una promesa rechazada sin dueño:
            // el error real ya lo trataron `onError`/`onAbort`, esto sólo deja
            // constancia de que fue el drenado el que se rompió.
            onError: (error) => {
                console.error('[estratega] fallo drenando el flujo del turno', {
                    organizationId: ctx.organizationId,
                    threadId,
                    messageId: assistantMessageId,
                    error:
                        error instanceof Error ? error.message : String(error),
                })
            },
        })

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
            onError: () =>
                'El Social Media Manager no pudo terminar la respuesta.',
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
            {
                error: 'El Social Media Manager no pudo responder. Inténtalo de nuevo.',
            },
            500,
        )
    }
}
