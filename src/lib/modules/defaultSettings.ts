/**
 * F5.2 (Estratega) Task 6 — qué `org_modules.settings` debe quedar tras
 * instalar un módulo.
 *
 * Regla (Controller ruling #1 de la Fase 1): los defaults se siembran SOLO en
 * la instalación en frío — fila sin ajustes todavía, o con `{}`. Una
 * REINSTALACIÓN (desinstalar y volver a instalar) de un tenant que YA había
 * tocado sus ajustes no debe perderlos: `setModuleStatus` reabre la MISMA
 * fila (ver `ModulesService.ts`), así que sin esta guarda un simple
 * "Instalar" de nuevo borraría en silencio los topes que alguien configuró.
 *
 * PURO: sin imports de red ni de Supabase. Sólo decide; quien llama hace la
 * escritura condicional.
 */
import { DEFAULT_STRATEGIST_SETTINGS } from '@/lib/assistant/budget'

/**
 * Defaults por slug de módulo. Un módulo sin entrada aquí no siembra nada —
 * hoy sólo `strategist` tiene ajustes propios (`telegram` no usa esta
 * columna).
 */
const DEFAULTS_BY_SLUG: Readonly<Record<string, Record<string, unknown>>> = {
    strategist: DEFAULT_STRATEGIST_SETTINGS as unknown as Record<string, unknown>,
}

/** ¿Está vacío el JSON de `settings` tal como sale de la base? */
function isEmptySettings(value: unknown): boolean {
    if (value === null || value === undefined) return true
    if (typeof value !== 'object' || Array.isArray(value)) return true
    return Object.keys(value as Record<string, unknown>).length === 0
}

/**
 * Decide los `settings` que debe quedar una fila `org_modules` tras
 * instalarse (o reinstalarse).
 *
 * Devuelve `undefined` cuando NO hay que escribir nada: el módulo no tiene
 * defaults propios, o la fila ya traía ajustes no vacíos. Devuelve un objeto
 * nuevo (copia de los defaults, nunca la misma referencia) cuando sí toca
 * sembrar.
 */
export function settingsAfterInstall(
    slug: string,
    existingSettings: unknown,
): Record<string, unknown> | undefined {
    if (!isEmptySettings(existingSettings)) return undefined
    const defaults = DEFAULTS_BY_SLUG[slug]
    if (!defaults) return undefined
    return { ...defaults }
}
