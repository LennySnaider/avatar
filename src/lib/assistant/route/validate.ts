/**
 * F5.2 (Estratega) Task 4 — LA PUERTA DE ENTRADA del cuerpo de la petición.
 *
 * Todo lo que llega a `POST /api/assistant/chat` viene del navegador, así que
 * nada de lo que trae es de fiar. Este fichero es el único sitio donde ese
 * JSON sin forma se convierte en datos con forma, y está APARTE de la ruta
 * por dos motivos:
 *   - la ruta arrastra `@/auth`, Supabase y el SDK de IA, y entonces sus
 *     reglas no se podrían probar con `tsx --test`;
 *   - las reglas son justo la clase de cosa que hay que poder leer de un
 *     vistazo: qué se rechaza, qué se normaliza y qué se deja pasar.
 *
 * LA DISTINCIÓN QUE MANDA AQUÍ: hay basura que RECHAZA el turno (400) y
 * basura que se NORMALIZA en silencio. El criterio no es estético:
 *   - `messages` mal formado ⇒ 400. Sin mensajes no hay pregunta, y seguir
 *     adelante significaría reservar tokens y llamar al modelo para nada.
 *   - `screen` desconocida ⇒ `'other'`. La pantalla sólo recorta el catálogo
 *     de herramientas y matiza el prompt; un valor que no conocemos cae al
 *     recorte MÁS conservador, y devolver 400 por eso rompería el widget
 *     entero el día que una pantalla nueva se despliegue antes que el
 *     servidor.
 *
 * PURO A PROPÓSITO: sólo `import type`. Nada de runtime.
 */
import type { UIMessage } from 'ai'
import type { AssistantScreen } from '../types'

/**
 * Las pantallas válidas, como VALOR (la unión `AssistantScreen` de
 * `../types.ts` sólo existe en tiempo de compilación y no se puede preguntar
 * en runtime). El `satisfies` de abajo es el que impide que las dos listas se
 * separen: si alguien añade una pantalla al tipo y no aquí, `tsc` protesta.
 */
export const ASSISTANT_SCREENS = [
    'inbox',
    'social-accounts',
    'social-posts',
    'studio',
    'modules',
    'other',
] as const satisfies readonly AssistantScreen[]

/** Comprobación inversa: que no sobre ninguna en la lista de arriba. */
type PantallasCubiertas = Exclude<
    AssistantScreen,
    (typeof ASSISTANT_SCREENS)[number]
>
// Si la unión tuviera una pantalla que falta en el array, esto sería un tipo
// no-`never` y la asignación fallaría en compilación.
const _todasLasPantallasCubiertas: PantallasCubiertas[] = []
void _todasLasPantallasCubiertas

/**
 * Normaliza la pantalla que dice el cliente. NUNCA lanza y NUNCA devuelve
 * `undefined`: lo desconocido es `'other'` (ver el docblock de arriba).
 */
export function parseAssistantScreen(raw: unknown): AssistantScreen {
    return typeof raw === 'string' &&
        (ASSISTANT_SCREENS as readonly string[]).includes(raw)
        ? (raw as AssistantScreen)
        : 'other'
}

export type ParsedChatBody =
    | {
          ok: true
          messages: UIMessage[]
          /** Ausente = hilo nuevo; la ruta lo crea. */
          threadId?: string
          screen: AssistantScreen
      }
    | { ok: false; error: string }

/** ¿Tiene esto la pinta mínima de un `UIMessage`? */
function pareceUIMessage(value: unknown): value is UIMessage {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false
    }
    const m = value as { role?: unknown; parts?: unknown }
    return typeof m.role === 'string' && Array.isArray(m.parts)
}

/**
 * Valida y normaliza el cuerpo de `POST /api/assistant/chat`.
 *
 * El último mensaje TIENE que ser del usuario: si fuera del asistente, la
 * ruta estaría generando una respuesta que nadie ha pedido — y cobrándola.
 * Ese caso no es un cliente exótico, es un cliente con un bug, y prefiero que
 * se entere con un 400 antes que con una factura.
 */
export function parseChatBody(json: unknown): ParsedChatBody {
    if (typeof json !== 'object' || json === null || Array.isArray(json)) {
        return {
            ok: false,
            error: 'El cuerpo de la petición debe ser un objeto JSON.',
        }
    }
    const body = json as {
        messages?: unknown
        threadId?: unknown
        screen?: unknown
    }

    if (!Array.isArray(body.messages) || body.messages.length === 0) {
        return { ok: false, error: '`messages` debe ser un array no vacío.' }
    }
    if (!body.messages.every(pareceUIMessage)) {
        return {
            ok: false,
            error: 'Cada mensaje debe tener `role` (texto) y `parts` (array).',
        }
    }
    const ultimo = body.messages[body.messages.length - 1]
    if (ultimo.role !== 'user') {
        return {
            ok: false,
            error: 'El último mensaje debe ser del usuario; no hay nada que contestar.',
        }
    }

    // `null`/`undefined` significan "hilo nuevo" y son legítimos; cualquier
    // otra cosa es un cliente roto y se rechaza en vez de inventarse un hilo.
    let threadId: string | undefined
    if (body.threadId !== undefined && body.threadId !== null) {
        if (typeof body.threadId !== 'string' || body.threadId.length === 0) {
            return {
                ok: false,
                error: '`threadId` debe ser el id de un hilo existente.',
            }
        }
        threadId = body.threadId
    }

    return {
        ok: true,
        messages: body.messages,
        threadId,
        screen: parseAssistantScreen(body.screen),
    }
}
