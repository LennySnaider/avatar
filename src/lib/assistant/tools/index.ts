/**
 * F5.2 (Estratega) — EL CATÁLOGO de herramientas del agente, en el orden en
 * que el modelo las ve.
 *
 * El orden no es alfabético: `listAvatars` va primera porque casi todo lo
 * demás necesita el `avatarId` que devuelve, y lo que un modelo lee antes
 * pesa más en la decisión de qué llamar.
 *
 * Fase 1 es SÓLO LECTURA: aquí no hay ni una herramienta con
 * `mutating: true`. Las que escriban llegarán en Fase 2 con su aprobación
 * humana, y este fichero es el sitio donde se verá de un vistazo cuáles son.
 */
import type { AssistantToolDef } from '../types'
import { listAvatars } from './read/avatars'
import { getSocialAnalytics, getRecentPostsPerformance } from './read/social'
import { getInboxSummary } from './read/inbox'
import { listMetaAdAccounts, getMetaAdAccountInsights } from './read/metaAds'

export const READ_TOOLS: AssistantToolDef[] = [
    listAvatars,
    getSocialAnalytics,
    getRecentPostsPerformance,
    getInboxSummary,
    listMetaAdAccounts,
    getMetaAdAccountInsights,
]

export {
    listAvatars,
    getSocialAnalytics,
    getRecentPostsPerformance,
    getInboxSummary,
    listMetaAdAccounts,
    getMetaAdAccountInsights,
}
