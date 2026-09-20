/**
 * Resuelve la decisión de `policy.ts` contra la base: ¿tiene la organización el
 * módulo y qué dicen sus ajustes?
 *
 * Aparte del núcleo puro a propósito: `entitlements` crea el cliente de
 * Supabase al importarse, así que juntarlos dejaría `decidirEstadoInicial` sin
 * pruebas unitarias. Mismo reparto que `budget.ts` (puro) frente a los
 * cargadores de ajustes del resto de módulos.
 */
import { hasModuleForOrg, moduleSettingsForOrg } from '@/lib/modules/entitlements'

import { decidirEstadoInicial, type Decision } from './policy'
import { leerAjustes, type AiMarkCleanerSettings } from './settings'
import { MODULO_AI_MARKS } from './types'

/** Ajustes normalizados del módulo para una organización. */
export async function cargarAjustesDeOrg(
    organizationId: string,
): Promise<AiMarkCleanerSettings> {
    return leerAjustes(await moduleSettingsForOrg(organizationId, MODULO_AI_MARKS))
}

/** Decide el `ai_marks_status` con el que nace una fila `generations`. */
export async function estadoInicialParaOrg(entrada: {
    organizationId: string
    mediaType: 'IMAGE' | 'VIDEO'
    storagePath: string
    storageProvider: string | null
}): Promise<Decision> {
    const moduloInstalado = await hasModuleForOrg(entrada.organizationId, MODULO_AI_MARKS)
    // Con el módulo apagado ni se leen los ajustes: una consulta menos en el
    // camino caliente de CADA generación de CADA organización.
    if (!moduloInstalado) {
        return { estado: 'skipped', motivo: 'modulo_apagado' }
    }
    const ajustes = await cargarAjustesDeOrg(entrada.organizationId)
    return decidirEstadoInicial({ ...entrada, moduloInstalado, ajustes })
}
