/**
 * Dependencias reales del barrido: consulta las filas con trabajo pendiente y
 * las que ya se pueden purgar.
 *
 * Aparte de `sweep.ts` por el mismo motivo que `runJob.server.ts`: la política
 * de selección se prueba sin base de datos.
 */
import { deleteMediaObject } from '@/lib/mediaStore'
import { orgSupabase } from '@/lib/org/orgTable'

import { clienteDesdeEntorno } from './client'
import { limpiarGeneracion } from './runJob.server'
import { barrer, type DependenciasBarrido, type ResumenBarrido } from './sweep'
import type { EstadoPersistido } from './types'

/** Ejecuta una pasada del barrido con las dependencias reales. */
export async function barrerMarcas(): Promise<ResumenBarrido> {
    const cliente = clienteDesdeEntorno()

    const deps: DependenciasBarrido = {
        async buscarPendientes({ ahora, limiteRetomar, tope }) {
            // El índice parcial `generations_ai_marks_pendientes_idx` cubre
            // justo este predicado, así que la consulta no recorre la tabla.
            const { data, error } = await orgSupabase()
                .from('generations')
                .select('id, media_type, ai_marks, ai_marks_status')
                .in('ai_marks_status', ['pending', 'running'])
                .order('created_at', { ascending: true })
                .limit(tope * 3)
            if (error) throw new Error(error.message)

            const ahoraMs = ahora.getTime()
            const limiteMs = limiteRetomar.getTime()
            return (data ?? [])
                .filter((fila) => {
                    const marcas = (fila as { ai_marks: EstadoPersistido | null }).ai_marks
                    const estado = (fila as { ai_marks_status: string }).ai_marks_status
                    if (estado === 'running') {
                        // Sólo las abandonadas: si el trabajador sigue vivo,
                        // dos limpiezas a la vez sobre la misma fila.
                        const tomada = marcas?.tomadaEn ? Date.parse(marcas.tomadaEn) : 0
                        return tomada < limiteMs
                    }
                    // `pending` con espera pendiente todavía no toca.
                    const siguiente = marcas?.siguienteIntentoEn
                        ? Date.parse(marcas.siguienteIntentoEn)
                        : 0
                    return !siguiente || siguiente <= ahoraMs
                })
                .slice(0, tope)
                .map((fila) => ({
                    id: (fila as { id: string }).id,
                    mediaType:
                        (fila as { media_type: string }).media_type === 'VIDEO'
                            ? ('VIDEO' as const)
                            : ('IMAGE' as const),
                }))
        },

        async buscarPurgables(ahora, tope) {
            const { data, error } = await orgSupabase()
                .from('generations')
                .select('id, ai_marks')
                .in('ai_marks_status', ['cleaned', 'partial'])
                .limit(tope * 4)
            if (error) throw new Error(error.message)
            const ahoraIso = ahora.toISOString()
            return (data ?? [])
                .map((fila) => ({
                    id: (fila as { id: string }).id,
                    aiMarks: (fila as { ai_marks: EstadoPersistido | null }).ai_marks,
                }))
                .filter(
                    (fila): fila is { id: string; aiMarks: EstadoPersistido } =>
                        !!fila.aiMarks &&
                        !fila.aiMarks.originalPurgadoEn &&
                        !!fila.aiMarks.purgarOriginalTras &&
                        fila.aiMarks.purgarOriginalTras <= ahoraIso &&
                        // Sin ruta limpia no hubo sustitución: el original
                        // sigue siendo el que se sirve y no se toca.
                        !!fila.aiMarks.rutaLimpia,
                )
                .slice(0, tope)
                .map((fila) => ({
                    id: fila.id,
                    rutaOriginal: fila.aiMarks.rutaOriginal,
                    miniaturaOriginal: fila.aiMarks.miniaturaOriginal,
                    aiMarks: fila.aiMarks,
                }))
        },

        ejecutar: limpiarGeneracion,

        async borrarObjeto(ruta) {
            await deleteMediaObject({ path: ruta, provider: 'r2' })
        },

        async marcarPurgada(generationId, aiMarks) {
            const { error } = await orgSupabase()
                .from('generations')
                .update({ ai_marks: aiMarks } as never)
                .eq('id', generationId)
            if (error) throw new Error(error.message)
        },

        async servicioSano() {
            if (!cliente.ok) {
                console.error(`[aiMarks] barrido sin configurar: ${cliente.error}`)
                return false
            }
            const salud = await cliente.cliente.salud()
            return salud.ok === true && 'modeloCargado' in salud && salud.modeloCargado
        },

        ahora: () => new Date(),
        registrar: (mensaje, error) => {
            if (error) console.error(mensaje, error)
            else console.error(mensaje)
        },
    }

    return barrer(deps)
}
