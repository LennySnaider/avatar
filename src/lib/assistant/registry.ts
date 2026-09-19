/**
 * F5.2 (Estratega) — EL REGISTRO: de la lista de herramientas declaradas al
 * catálogo que ve el modelo en ESTE turno.
 *
 * Dos funciones y una frontera entre ellas:
 *   - `selectTools` es PURA (rol + pantalla → subconjunto). Es la que decide
 *     la seguridad y el coste, así que se testea sin base de datos.
 *   - `toAiTools` es la traducción al `ToolSet` de `ai`, y lo único que hace
 *     es atar el `env` (la organización del que pregunta) a cada `execute`.
 *
 * POR QUÉ FILTRAR Y NO RECHAZAR AL EJECUTAR: si la herramienta está en el
 * catálogo, el modelo la llamará y habrá que explicarle un "no puedes" —
 * tokens gastados y una conversación rara. Filtrando antes, para un
 * `operator` la herramienta sencillamente NO EXISTE. Es el mismo criterio que
 * `requirePermission` en los servicios, movido un paso antes.
 */
import { tool, type ToolSet } from 'ai'
import { can } from '@/lib/org/permissions'
import type { AssistantToolDef, ToolEnv, ToolSelection } from './types'

/**
 * Las herramientas que este rol puede usar en esta pantalla, en el mismo
 * orden en que se declararon (el orden importa: es el que ve el modelo, y
 * las de contexto general van primero).
 *
 * Un rol que no está en la matriz no ve NADA: `can()` ya falla cerrado ante
 * un rol desconocido, y aquí eso se traduce en un catálogo vacío en vez de
 * un catálogo completo.
 */
export function selectTools(
    defs: readonly AssistantToolDef[],
    { role, screen }: ToolSelection,
): AssistantToolDef[] {
    return defs.filter(
        (def) =>
            can(role, def.permission) &&
            (def.screens === 'all' || def.screens.includes(screen)),
    )
}

/**
 * Convierte las definiciones ya filtradas en el `ToolSet` que come
 * `streamText`/`generateText`.
 *
 * El `env` viaja por CLAUSURA y no por el input del modelo: la organización
 * y el usuario los pone el servidor a partir de la sesión, nunca el modelo.
 * Si viajaran en el `inputSchema`, una inyección de prompt podría pedir los
 * datos de OTRA organización.
 *
 * Los nombres duplicados LANZAN en vez de pisarse en silencio: dos
 * herramientas con el mismo nombre en un `Record` dejan viva sólo la última,
 * y el síntoma sería "la herramienta hace algo distinto de lo que dice su
 * descripción" — indiagnosticable desde fuera.
 */
export function toAiTools(
    defs: readonly AssistantToolDef[],
    env: ToolEnv,
): ToolSet {
    const tools: ToolSet = {}
    for (const def of defs) {
        if (Object.hasOwn(tools, def.name)) {
            throw new Error(
                `toAiTools: herramienta duplicada "${def.name}" — los nombres deben ser únicos en el registro`,
            )
        }
        tools[def.name] = tool({
            description: def.description,
            inputSchema: def.inputSchema,
            execute: (input) => def.execute(input, env),
        })
    }
    return tools
}
