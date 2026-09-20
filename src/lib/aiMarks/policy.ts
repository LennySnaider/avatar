/**
 * Decide si una generación entra en la cola de limpieza al nacer.
 *
 * PURO: sin imports de red ni de Supabase, para poder probarlo con `tsx --test`.
 * La variante que resuelve el módulo y los ajustes contra la base vive en
 * `policy.server.ts` — importar `entitlements` aquí crearía el cliente de
 * Supabase al cargar el módulo y dejaría esta lógica sin pruebas unitarias.
 */
import { esLimpiable, esRutaLimpia } from './paths'
import { limpiaEsteTipo, type AiMarkCleanerSettings } from './settings'
import type { EstadoAiMarks, MotivoSalto } from './types'

export interface EntradaDecision {
    mediaType: 'IMAGE' | 'VIDEO'
    storagePath: string
    /** `'r2'`, `'supabase'` o lo que traiga la fila. */
    storageProvider: string | null
    moduloInstalado: boolean
    ajustes: AiMarkCleanerSettings
}

export type Decision =
    | { estado: Extract<EstadoAiMarks, 'pending'> }
    | { estado: Extract<EstadoAiMarks, 'skipped'>; motivo: MotivoSalto }

/**
 * El núcleo de la decisión, sin `I/O`.
 *
 * El orden de las comprobaciones importa para el mensaje que verá el tenant:
 * "el módulo está apagado" explica mejor que "formato no soportado" cuando las
 * dos cosas son ciertas.
 */
export function decidirEstadoInicial(entrada: EntradaDecision): Decision {
    if (!entrada.moduloInstalado) {
        return { estado: 'skipped', motivo: 'modulo_apagado' }
    }
    if (!limpiaEsteTipo(entrada.ajustes, entrada.mediaType)) {
        return { estado: 'skipped', motivo: 'ajuste_apagado' }
    }
    // Sólo R2: el limpiador trabaja con URLs prefirmadas de R2 y el respaldo en
    // Supabase Storage es una ruta de emergencia que ya no se usa en producción.
    if (entrada.storageProvider !== 'r2') {
        return { estado: 'skipped', motivo: 'almacenamiento_no_r2' }
    }
    if (esRutaLimpia(entrada.storagePath)) {
        return { estado: 'skipped', motivo: 'ya_limpia' }
    }
    if (!esLimpiable(entrada.storagePath)) {
        return { estado: 'skipped', motivo: 'formato_no_soportado' }
    }
    return { estado: 'pending' }
}
