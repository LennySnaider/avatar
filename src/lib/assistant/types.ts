/**
 * F5.2 (Estratega) — El CONTRATO de una herramienta del agente de la
 * organización. Un solo tipo que describe qué hace, quién puede usarla y en
 * qué pantalla aparece; el registro (`./registry.ts`) lo lee y el SDK de IA
 * nunca ve más que lo que ese filtro deja pasar.
 *
 * POR QUÉ UN TIPO PROPIO Y NO EL `tool()` DE `ai` DIRECTAMENTE: el `Tool` del
 * SDK sólo sabe de `description`/`inputSchema`/`execute`. Le faltan las dos
 * cosas de las que depende la seguridad y el coste de este agente:
 *   - `permission`: el rol de quien pregunta decide si la herramienta existe
 *     (un `operator` no ve lo que no puede ver). Filtrar ANTES de construir
 *     el `ToolSet` es lo que hace imposible que el modelo la llame: no se
 *     puede invocar lo que no está en el catálogo.
 *   - `screens`: Fase 0 midió que el catálogo completo del MCP de Meta son
 *     95 herramientas y ~170k caracteres de esquema. Cada herramienta
 *     expuesta se paga en tokens de entrada EN CADA TURNO, así que la
 *     pantalla desde la que se abre el widget recorta el catálogo a lo que
 *     tiene sentido allí.
 *
 * `mutating` existe ya aunque la Fase 1 sea SÓLO LECTURA (todas en `false`):
 * es el campo del que colgará la aprobación humana de la Fase 2. Declararlo
 * ahora obliga a cada herramienta nueva a pronunciarse.
 *
 * PURO A PROPÓSITO: sólo `import type` salvo zod. Así `registry.test.ts`
 * puede importarlo con `tsx --test` sin arrastrar `@/auth` ni Supabase.
 */
import type { z } from 'zod'
import type { Permission, OrgRole } from '@/lib/org/permissions'
import type { OrgContext } from '@/lib/tenant/getOrgContext'

/**
 * Desde dónde se abrió el widget. NO es decorativo: es el recorte del
 * catálogo de herramientas (ver arriba) y también un dato del prompt de
 * sistema ("el usuario está mirando el inbox").
 *
 * `'other'` es el cajón honesto para cualquier pantalla que no esté en la
 * lista — mejor un valor explícito que un `undefined` que cada llamador
 * interprete a su manera.
 */
export type AssistantScreen =
    | 'inbox'
    | 'social-accounts'
    | 'social-posts'
    | 'studio'
    | 'modules'
    | 'other'

/** Todo lo que una herramienta necesita del servidor para ejecutarse. */
export interface ToolEnv {
    /** Organización + usuario + rol ya resueltos por la ruta. TODA consulta
     *  de una herramienta pasa por `orgTable(ctx, …)` con este contexto. */
    ctx: OrgContext
}

/** Lo que se le pregunta al registro: quién pregunta y desde dónde. */
export interface ToolSelection {
    role: OrgRole
    screen: AssistantScreen
}

/**
 * Una herramienta del asistente.
 *
 * `I` es el tipo de entrada que produce `inputSchema`. El valor por defecto
 * `unknown` es el tipo BORRADO con el que viajan en listas heterogéneas
 * (`AssistantToolDef[]`): `z.ZodType` es covariante en su salida, así que un
 * `AssistantToolDef<{avatarId: string}>` entra en esa lista sin castings.
 *
 * `execute` se declara como MÉTODO y no como propiedad-función a propósito:
 * TypeScript trata los parámetros de método de forma bivariante, que es
 * exactamente lo que permite meter herramientas con entradas distintas en la
 * misma lista. La seguridad real no la da aquí el tipo, la da zod: el SDK
 * valida la entrada contra `inputSchema` antes de llamar a `execute`.
 */
export interface AssistantToolDef<I = unknown> {
    /** Nombre con el que el modelo la invoca. Único en el registro. */
    readonly name: string
    /** Para el modelo, no para el usuario: cuándo usarla y qué devuelve. */
    readonly description: string
    readonly inputSchema: z.ZodType<I>
    /** Permiso de `@/lib/org/permissions` que el rol debe tener. */
    readonly permission: Permission
    /** Pantallas donde se expone, o `'all'` para todas. */
    readonly screens: readonly AssistantScreen[] | 'all'
    /** ¿Escribe algo? En Fase 1 SIEMPRE `false`. */
    readonly mutating: boolean
    execute(input: I, env: ToolEnv): Promise<unknown>
}
