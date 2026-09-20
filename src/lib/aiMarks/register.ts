/**
 * Lanza la limpieza cuando nace una generación.
 *
 * LA IMAGEN SE ESPERA, EL VÍDEO NO. Una imagen tarda 2-3 s medidos, así que
 * cabe dentro del guardado y la fila vuelve al cliente ya limpia: el usuario ve
 * la miniatura buena a la primera. Un vídeo tarda decenas de segundos y el
 * cliente guarda con un tope de 30 s, así que esperar lo rompería.
 *
 * Y la imagen se espera CON PRESUPUESTO: si se pasa del tope, el trabajo sigue
 * en segundo plano y la fila vuelve sin limpiar todavía. Nunca se bloquea un
 * guardado por la limpieza.
 */
import { after } from 'next/server'

import type { DesenlaceTrabajo } from './types'

/**
 * Cuánto se espera a una imagen antes de mandarla al segundo plano.
 *
 * 12 s sobre los 2-3 s medidos deja sitio a un arranque en frío del contenedor
 * sin acercarse al tope de 30 s con el que el cliente guarda la fila.
 */
export const PRESUPUESTO_IMAGEN_MS = Number(
    process.env.AI_MARKS_IMAGE_SYNC_BUDGET_MS ?? 12_000,
)

/** Resultado del lanzamiento, desde el punto de vista de quien guardó la fila. */
export type Lanzamiento =
    /** Terminó a tiempo: la fila ya tiene su ruta final. */
    | { estado: 'terminado'; desenlace: DesenlaceTrabajo }
    /** Sigue en marcha. La fila vuelve con el original y el barrido la recoge. */
    | { estado: 'en_segundo_plano' }
    /** No se intentó porque el módulo no aplica a esta fila. */
    | { estado: 'no_aplica' }

interface Opciones {
    generationId: string
    mediaType: 'IMAGE' | 'VIDEO'
    /** El estado con el que nació la fila. Sólo `pending` tiene trabajo. */
    estadoInicial: string
    /** Inyectables para la prueba. */
    ejecutar?: (id: string) => Promise<DesenlaceTrabajo>
    diferir?: (tarea: () => Promise<unknown>) => void
    presupuestoMs?: number
}

export async function lanzarLimpieza(opciones: Opciones): Promise<Lanzamiento> {
    if (opciones.estadoInicial !== 'pending') return { estado: 'no_aplica' }

    // Import diferido: `runJob.server` crea el cliente de Supabase al
    // cargarse, así que importarlo arriba dejaría este módulo sin pruebas
    // unitarias aunque la prueba inyecte su propio `ejecutar`.
    const ejecutar =
        opciones.ejecutar ??
        (async (id: string) => {
            const { limpiarGeneracion } = await import('./runJob.server')
            return limpiarGeneracion(id)
        })
    const diferir = opciones.diferir ?? ((tarea) => after(tarea))
    const trabajo = ejecutar(opciones.generationId)

    // Una promesa sin `catch` que se rechaza tras devolverla tumbaría el
    // proceso. `limpiarGeneracion` ya no lanza, pero el guardarraíl es barato.
    const seguro = trabajo.catch((err): DesenlaceTrabajo => {
        console.error(`[aiMarks] ${opciones.generationId} lanzamiento`, err)
        return { estado: 'fallido', intentos: 0, error: String(err) }
    })

    if (opciones.mediaType === 'VIDEO') {
        diferir(() => seguro)
        return { estado: 'en_segundo_plano' }
    }

    const presupuesto = opciones.presupuestoMs ?? PRESUPUESTO_IMAGEN_MS
    const testigo = Symbol('presupuesto')
    const carrera = await Promise.race([
        seguro,
        new Promise<typeof testigo>((resolver) => setTimeout(() => resolver(testigo), presupuesto)),
    ])

    if (carrera === testigo) {
        diferir(() => seguro)
        return { estado: 'en_segundo_plano' }
    }
    return { estado: 'terminado', desenlace: carrera }
}
