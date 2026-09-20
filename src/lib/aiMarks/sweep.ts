/**
 * El barrido: recoge lo que quedó a medias y purga los originales ya
 * sustituidos.
 *
 * POR QUÉ EXISTE si `apiSaveGeneration` ya lanza el trabajo: la función que lo
 * lanzó puede morir antes de terminarlo (un vídeo tarda más que la petición que
 * lo encoló), el servicio puede estar lleno, o la red puede fallar. Sin barrido
 * esas filas se quedarían en `pending` para siempre y el tenant vería un
 * "limpiando…" eterno.
 *
 * Dependencias inyectadas, como en `runJob`, para poder probar la política de
 * selección sin base de datos.
 */
import type { DesenlaceTrabajo, EstadoPersistido } from './types'

/**
 * Una fila `running` cuyo trabajador lleva más de esto sin terminar se
 * considera muerta y se puede retomar.
 *
 * Es MÁS ALTO que el umbral con el que la interfaz ofrece reintentar (10 min,
 * `presentation.ts`) a propósito: el usuario puede pedir un reintento antes de
 * que el barrido decida que el trabajador murió, y no al revés. Si fuera al
 * revés, dos trabajadores correrían sobre la misma fila.
 */
export const MS_PARA_RETOMAR_TOMADA = 15 * 60_000

/** Cuántas se toman por pasada. */
export const TOPE_IMAGENES = 20
export const TOPE_VIDEOS = 3

export interface Candidata {
    id: string
    mediaType: 'IMAGE' | 'VIDEO'
}

export interface Purgable {
    id: string
    rutaOriginal: string
    miniaturaOriginal?: string
    aiMarks: EstadoPersistido
}

export interface DependenciasBarrido {
    /** Filas con trabajo pendiente cuya espera ya venció. */
    buscarPendientes(entrada: {
        ahora: Date
        limiteRetomar: Date
        tope: number
    }): Promise<Candidata[]>
    /** Filas limpias cuyo original ya se puede borrar. */
    buscarPurgables(ahora: Date, tope: number): Promise<Purgable[]>
    ejecutar(generationId: string): Promise<DesenlaceTrabajo>
    borrarObjeto(ruta: string): Promise<void>
    marcarPurgada(generationId: string, aiMarks: EstadoPersistido): Promise<void>
    /** `false` corta la pasada: el servicio está caído. */
    servicioSano(): Promise<boolean>
    ahora(): Date
    registrar(mensaje: string, error?: unknown): void
}

export interface ResumenBarrido {
    tomadas: number
    limpiadas: number
    sinMarcas: number
    fallidas: number
    reintentos: number
    purgadas: number
    omitidoPorServicioCaido: boolean
}

export async function barrer(deps: DependenciasBarrido): Promise<ResumenBarrido> {
    const resumen: ResumenBarrido = {
        tomadas: 0,
        limpiadas: 0,
        sinMarcas: 0,
        fallidas: 0,
        reintentos: 0,
        purgadas: 0,
        omitidoPorServicioCaido: false,
    }
    const ahora = deps.ahora()

    // La purga NO depende del servicio: son borrados en R2 de objetos que ya
    // fueron sustituidos. Se hace siempre, incluso con el limpiador caído.
    resumen.purgadas = await purgarOriginales(deps, ahora)

    if (!(await deps.servicioSano())) {
        // Sin esto, una caída de media hora gastaría los tres intentos de
        // todas las filas en vuelo y las dejaría en `failed` sin motivo real.
        deps.registrar('[aiMarks] barrido: el limpiador no responde; no se toma trabajo')
        resumen.omitidoPorServicioCaido = true
        return resumen
    }

    const candidatas = await deps.buscarPendientes({
        ahora,
        limiteRetomar: new Date(ahora.getTime() - MS_PARA_RETOMAR_TOMADA),
        tope: TOPE_IMAGENES + TOPE_VIDEOS,
    })

    const imagenes = candidatas.filter((c) => c.mediaType === 'IMAGE').slice(0, TOPE_IMAGENES)
    const videos = candidatas.filter((c) => c.mediaType === 'VIDEO').slice(0, TOPE_VIDEOS)

    // Las imágenes van de dos en dos (la concurrencia del servicio) y los
    // vídeos de uno en uno: un vídeo ocupa la CPU entera durante minutos.
    for (const lote of enLotes(imagenes, 2)) {
        const desenlaces = await Promise.all(lote.map((c) => ejecutarSeguro(c, deps)))
        for (const d of desenlaces) contar(resumen, d)
    }
    for (const video of videos) {
        contar(resumen, await ejecutarSeguro(video, deps))
    }

    return resumen
}

async function ejecutarSeguro(
    candidata: Candidata,
    deps: DependenciasBarrido,
): Promise<DesenlaceTrabajo> {
    try {
        return await deps.ejecutar(candidata.id)
    } catch (err) {
        // Una fila que revienta no puede tumbar la pasada entera: las demás
        // siguen siendo trabajo legítimo.
        deps.registrar(`[aiMarks] barrido: ${candidata.id} reventó`, err)
        return { estado: 'fallido', intentos: 0, error: String(err) }
    }
}

function contar(resumen: ResumenBarrido, desenlace: DesenlaceTrabajo): void {
    if (desenlace.estado === 'no_tomado') return
    resumen.tomadas += 1
    if (desenlace.estado === 'cleaned' || desenlace.estado === 'partial') resumen.limpiadas += 1
    else if (desenlace.estado === 'no_marks') resumen.sinMarcas += 1
    else if (desenlace.estado === 'fallido') resumen.fallidas += 1
    else if (desenlace.estado === 'reintento_programado') resumen.reintentos += 1
}

async function purgarOriginales(deps: DependenciasBarrido, ahora: Date): Promise<number> {
    const purgables = await deps.buscarPurgables(ahora, 50)
    let purgadas = 0
    for (const fila of purgables) {
        try {
            await deps.borrarObjeto(fila.rutaOriginal)
            if (fila.miniaturaOriginal) {
                await deps.borrarObjeto(fila.miniaturaOriginal).catch(() => undefined)
            }
            await deps.marcarPurgada(fila.id, {
                ...fila.aiMarks,
                originalPurgadoEn: ahora.toISOString(),
            })
            purgadas += 1
        } catch (err) {
            // Un original que no se pudo borrar queda huérfano y lo barre
            // `scripts/purge-r2-unreferenced.mjs`. No se reintenta aquí para
            // no bloquear la purga de los demás.
            deps.registrar(`[aiMarks] barrido: no se pudo purgar ${fila.rutaOriginal}`, err)
        }
    }
    return purgadas
}

function enLotes<T>(items: T[], tamano: number): T[][] {
    const lotes: T[][] = []
    for (let i = 0; i < items.length; i += tamano) lotes.push(items.slice(i, i + tamano))
    return lotes
}
