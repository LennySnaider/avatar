/**
 * F5.2 (Estratega) — Modelos de Gemini que usa el agente de la organización.
 *
 * Un solo lugar para estos dos strings: `src/lib/billing/catalog.ts`
 * (`MODEL_USD_PER_M`, para tarifar `tokensForUsage`) y el runtime del
 * asistente (Task 3, `@ai-sdk/google`) los importan de aquí. Si se cambia el
 * modelo, se cambia UNA vez y el precio sigue el mismo string.
 *
 * IDs verificados contra la unión `GoogleGenerativeAIModelId` de
 * `node_modules/@ai-sdk/google/dist/index.d.ts` (2026-09-18) — los dos están
 * en la lista, no son un alias inventado.
 */

/**
 * Modelo por defecto de los turnos con herramientas (lectura de Meta,
 * contenido). Barato y rápido — Fase 0 lo midió en ~2.6-2.8k tokens por
 * turno de lectura simple y ~14k con una llamada MCP.
 */
export const ASSISTANT_TOOL_MODEL = 'gemini-flash-latest'

/**
 * Modelo Pro, reservado para turnos que lo justifiquen (razonamiento más
 * largo). Precio en `MODEL_USD_PER_M['gemini-2.5-pro']` de
 * `src/lib/billing/catalog.ts`, marcado `estimated: true` porque Fase 0 no
 * lo corrió en vivo.
 */
export const ASSISTANT_PRO_MODEL = 'gemini-2.5-pro'
