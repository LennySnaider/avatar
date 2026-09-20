/**
 * Traduce el estado de limpieza al chip que ve el usuario en la galería.
 *
 * PURO: sin imports. Lo usan el badge de la galería y el aviso del diálogo de
 * publicación, para que los dos digan exactamente lo mismo.
 */
import type { EstadoAiMarks, EstadoPersistido, MotivoSalto } from './types'

/**
 * Cuánto puede quedarse una fila en `pending`/`running` antes de que se
 * presente como fallida.
 *
 * No es un tope del trabajo sino de la PACIENCIA de la interfaz: si la función
 * murió antes de tomar la fila, el barrido la recoge en el siguiente minuto;
 * pasados 10 no hay excusa y el usuario merece un botón de reintento en vez de
 * un "limpiando…" eterno. El barrido usa su propio umbral (15 min) para
 * retomar una fila tomada, más alto a propósito: la UI puede ofrecer reintentar
 * antes de que el barrido considere muerto al trabajador.
 */
export const MS_ANTES_DE_DARLA_POR_PERDIDA = 10 * 60 * 1000

export type ChipAiMarks =
    /** Nada que pintar: generación anterior a la feature. */
    | { tipo: 'ninguno' }
    | { tipo: 'sin_modulo'; motivo: MotivoSalto }
    | { tipo: 'limpiando' }
    | { tipo: 'limpio'; removidas: string[] }
    | { tipo: 'parcial'; removidas: string[]; sobrevivientes: string[] }
    | { tipo: 'sin_marcas' }
    | { tipo: 'fallido'; error: string; reintentable: true }

function removidas(estado: EstadoPersistido | null | undefined): string[] {
    const informe = estado?.informe
    if (!informe) return []
    const visibles = informe.visibles
        .filter((m) => m.estado === 'removida')
        .map((m) => m.etiqueta)
    return [...visibles, ...informe.metadatos.removidos]
}

function sobrevivientes(estado: EstadoPersistido | null | undefined): string[] {
    const informe = estado?.informe
    if (!informe) return []
    const visibles = informe.visibles
        .filter((m) => m.estado !== 'removida')
        .map((m) => m.etiqueta)
    return [...visibles, ...informe.metadatos.sobrevivientes]
}

/**
 * Chip para una fila de `generations`.
 *
 * `ahoraMs` se inyecta en vez de leer el reloj para que la prueba pueda fijar
 * el instante; la regla de los 10 minutos es justo lo que hay que probar.
 */
export function chipParaGeneracion(
    estadoFila: EstadoAiMarks | null | undefined,
    aiMarks: EstadoPersistido | null | undefined,
    ahoraMs: number,
): ChipAiMarks {
    switch (estadoFila) {
        case 'cleaned':
            return { tipo: 'limpio', removidas: removidas(aiMarks) }
        case 'partial':
            return {
                tipo: 'parcial',
                removidas: removidas(aiMarks),
                sobrevivientes: sobrevivientes(aiMarks),
            }
        case 'no_marks':
            return { tipo: 'sin_marcas' }
        case 'failed':
            return {
                tipo: 'fallido',
                error: aiMarks?.error ?? 'sin detalle',
                reintentable: true,
            }
        case 'skipped':
            return { tipo: 'sin_modulo', motivo: aiMarks?.motivoSalto ?? 'modulo_apagado' }
        case 'pending':
        case 'running': {
            // Una fila encolada hace 20 minutos no está "limpiándose": la
            // función que la iba a tomar murió. Decir la verdad y ofrecer el
            // reintento es mejor que un spinner que no acaba nunca.
            const desde = aiMarks?.tomadaEn ?? aiMarks?.registradaEn
            const inicio = desde ? Date.parse(desde) : Number.NaN
            const perdida =
                Number.isFinite(inicio) && ahoraMs - inicio > MS_ANTES_DE_DARLA_POR_PERDIDA
            if (perdida) {
                return {
                    tipo: 'fallido',
                    error: aiMarks?.error ?? 'la limpieza no terminó a tiempo',
                    reintentable: true,
                }
            }
            return { tipo: 'limpiando' }
        }
        default:
            return { tipo: 'ninguno' }
    }
}

/** ¿Debe el diálogo de publicación avisar antes de mandar esto a una red? */
export function avisarAlPublicar(chip: ChipAiMarks): boolean {
    return chip.tipo === 'fallido' || chip.tipo === 'limpiando' || chip.tipo === 'parcial'
}
