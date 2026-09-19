'use client'

import Spinner from '@/components/ui/Spinner'
import Tag from '@/components/ui/Tag'
import type { ReactNode } from 'react'
import type { UIMessage } from 'ai'

/**
 * F5.2 (Estratega) Task 5 — CÓMO SE PINTA un turno.
 *
 * Está aparte del widget porque es la única pieza sin estado de todo esto:
 * entran `UIMessage[]`, sale JSX. El widget se queda con el transporte, el
 * hilo y el presupuesto.
 *
 * LAS HERRAMIENTAS LLEGAN POR DOS CAMINOS DISTINTOS, y ambos se pintan como
 * el mismo chip:
 *   - EN VIVO, mientras el turno stremea, el SDK crea partes `tool-<nombre>`
 *     (o `dynamic-tool` para las del MCP de Meta) con un `state` que va de
 *     `input-streaming` a `output-available`. Mientras no haya salida, el chip
 *     lleva spinner.
 *   - DEL HISTORIAL, lo que `getAssistantThread` devuelve NO son partes de
 *     herramienta: la ruta persiste un resumen en una parte de datos
 *     `data-tools` (`[{ toolName, input }]`, ver `partesDeRespuesta` en
 *     `src/app/api/assistant/chat/route.ts`). Si sólo se leyeran las partes
 *     `tool-*`, al recargar un hilo desaparecerían todas las llamadas y la
 *     respuesta parecería sacada de la nada.
 *
 * SIN LIBRERÍA DE MARKDOWN a propósito: el texto se pinta tal cual con
 * `whitespace-pre-wrap`. Meter un renderizador de markdown aquí significa
 * meter HTML generado por un modelo en el DOM de la aplicación; para un panel
 * de respuestas cortas no compensa ni el peso ni la superficie.
 */

/** Un chip de herramienta ya normalizado, venga de donde venga. */
interface ToolChip {
    key: string
    name: string
    /** ¿Sigue ejecutándose? Sólo puede ser cierto en un turno en vivo. */
    running: boolean
}

/** Las partes que este componente sabe pintar; el resto se ignora en silencio. */
type Part = UIMessage['parts'][number]

/**
 * Chips de una parte suelta. Devuelve una lista porque `data-tools` trae
 * varias llamadas en una sola parte.
 */
function chipsDeParte(part: Part, index: number): ToolChip[] {
    if (part.type === 'dynamic-tool') {
        return [
            {
                key: part.toolCallId || `dyn-${index}`,
                name: part.toolName,
                running:
                    part.state === 'input-streaming' ||
                    part.state === 'input-available',
            },
        ]
    }
    if (part.type.startsWith('tool-')) {
        const tool = part as Extract<Part, { type: `tool-${string}` }>
        return [
            {
                key: tool.toolCallId || `tool-${index}`,
                name: part.type.slice('tool-'.length),
                running:
                    tool.state === 'input-streaming' ||
                    tool.state === 'input-available',
            },
        ]
    }
    if (part.type === 'data-tools') {
        const data = (part as { data?: unknown }).data
        if (!Array.isArray(data)) return []
        return data.flatMap((llamada, i) => {
            const nombre = (llamada as { toolName?: unknown })?.toolName
            if (typeof nombre !== 'string' || nombre.length === 0) return []
            return [{ key: `hist-${index}-${i}`, name: nombre, running: false }]
        })
    }
    return []
}

const CHIP_CLASS =
    'bg-gray-100 text-gray-600 dark:bg-gray-600/40 dark:text-gray-100 border-0 text-[11px]'

const ToolChips = ({ chips }: { chips: ToolChip[] }) => {
    if (chips.length === 0) return null
    return (
        <div className="flex flex-wrap gap-1 mt-1">
            {chips.map((chip) => (
                <Tag key={chip.key} className={CHIP_CLASS}>
                    <span className="flex items-center gap-1">
                        {chip.running ? (
                            <Spinner size={12} />
                        ) : (
                            <span aria-hidden>📊</span>
                        )}
                        {chip.name}
                    </span>
                </Tag>
            ))}
        </div>
    )
}

const Bubble = ({
    role,
    children,
}: {
    role: UIMessage['role']
    children: ReactNode
}) => (
    <div
        className={`px-3 py-2 rounded-2xl max-w-[90%] whitespace-pre-wrap text-sm break-words ${
            role === 'user'
                ? 'bg-primary text-white rounded-br-sm'
                : 'bg-gray-100 dark:bg-gray-700 rounded-bl-sm'
        }`}
    >
        {children}
    </div>
)

const StrategistMessage = ({ message }: { message: UIMessage }) => {
    const texto = message.parts
        .map((p) => (p.type === 'text' ? p.text : ''))
        .join('')
    const chips = message.parts.flatMap((p, i) => chipsDeParte(p, i))

    // Un turno que sólo ha llamado herramientas todavía no tiene texto: sin
    // este guion la burbuja saldría vacía y parecería que se colgó.
    const cuerpo = texto.length > 0 ? texto : '…'

    return (
        <div
            className={`flex flex-col ${
                message.role === 'user' ? 'items-end' : 'items-start'
            }`}
        >
            <Bubble role={message.role}>{cuerpo}</Bubble>
            {message.role !== 'user' && <ToolChips chips={chips} />}
        </div>
    )
}

const StrategistMessages = ({ messages }: { messages: UIMessage[] }) => (
    <>
        {messages.map((message) => (
            <StrategistMessage key={message.id} message={message} />
        ))}
    </>
)

export default StrategistMessages
