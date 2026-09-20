/**
 * El trabajo de limpieza de UNA generación: tomarla, limpiarla, cambiarle la
 * ruta y cobrar.
 *
 * Todas las dependencias entran por parámetro (`Dependencias`) para que la
 * prueba pueda ejecutar la máquina de estados entera sin Supabase, sin R2 y sin
 * contenedor. La versión que resuelve las dependencias de verdad vive en
 * `runJob.server.ts`.
 */
import { claveDeCobro, cotizar, debeCobrar } from './billing'
import type { ClienteLimpiador } from './client'
import { rutaLimpia, rutaMiniatura } from './paths'
import type {
    DesenlaceTrabajo,
    EstadoAiMarks,
    EstadoPersistido,
    InformeLimpieza,
} from './types'

/** Intentos antes de rendirse, y cuánto esperar entre ellos. */
export const MAX_INTENTOS = 3
export const ESPERAS_MS = [60_000, 5 * 60_000, 30 * 60_000]

/**
 * Cuánto puede llevar tomada una fila antes de que otro trabajador la retome.
 *
 * Vive aquí y no en `sweep.ts` porque quien toma la fila es este módulo: el
 * barrido sólo decide a cuáles llamar. Mismo valor que `MS_PARA_RETOMAR_TOMADA`
 * del barrido, y si alguna vez se separan, manda éste.
 */
export const MS_PARA_RETOMAR_TOMADA_EN_RUNJOB = 15 * 60_000

/** Cuánto se conserva el original antes de borrarlo. */
export const MS_ANTES_DE_PURGAR_ORIGINAL = 60 * 60_000

/** La fila tal como la necesita el trabajo. */
export interface FilaGeneracion {
    id: string
    organizationId: string
    userId: string | null
    mediaType: 'IMAGE' | 'VIDEO'
    storagePath: string
    thumbnailPath: string | null
    estado: EstadoAiMarks
    aiMarks: EstadoPersistido | null
    proveedor: string | null
}

export interface Dependencias {
    /**
     * Toma la fila de forma atómica. Devuelve la fila si este trabajador se la
     * quedó, o `null` si otro llegó antes. Es un UPDATE condicional, no un
     * SELECT seguido de UPDATE: dos barridos solapados tomarían la misma.
     */
    tomar(generationId: string, ahora: Date): Promise<FilaGeneracion | null>
    /** Cambia la fila al estado final y guarda el informe. */
    guardar(
        generationId: string,
        cambios: {
            estado: EstadoAiMarks
            aiMarks: EstadoPersistido
            storagePath?: string
            thumbnailPath?: string | null
        },
    ): Promise<{ filasAfectadas: number }>
    urlLectura(ruta: string): Promise<string>
    urlEscritura(ruta: string): Promise<string>
    borrarObjeto(ruta: string): Promise<void>
    cliente: ClienteLimpiador
    /** Cobra y devuelve los tokens cobrados; 0 si la org está exenta. */
    cobrar(entrada: {
        organizationId: string
        userId: string | null
        generationId: string
        tokens: number
        sku: string
        costUsd: number
        idempotencyKey: string
        informe: InformeLimpieza
    }): Promise<{ tokens: number } | { error: string }>
    ahora(): Date
    registrar(mensaje: string, error?: unknown): void
}

function tipoDeContenido(ruta: string): string {
    const ext = ruta.slice(ruta.lastIndexOf('.') + 1).toLowerCase()
    if (ext === 'mp4') return 'video/mp4'
    if (ext === 'png') return 'image/png'
    if (ext === 'webp') return 'image/webp'
    return 'image/jpeg'
}

/** La misma caché inmutable con la que se subió el original. */
const CACHE_INMUTABLE = 'public, max-age=31536000, immutable'

function siguienteEspera(intentos: number): number {
    return ESPERAS_MS[Math.min(intentos, ESPERAS_MS.length - 1)]
}

export async function ejecutarTrabajo(
    generationId: string,
    deps: Dependencias,
): Promise<DesenlaceTrabajo> {
    const ahora = deps.ahora()
    const fila = await deps.tomar(generationId, ahora)
    if (!fila) return { estado: 'no_tomado' }

    const estadoPrevio = fila.aiMarks
    const intentos = (estadoPrevio?.intentos ?? 0) + 1
    const base: EstadoPersistido = {
        ...(estadoPrevio ?? {
            rutaOriginal: fila.storagePath,
            registradaEn: ahora.toISOString(),
        }),
        rutaOriginal: estadoPrevio?.rutaOriginal ?? fila.storagePath,
        miniaturaOriginal: estadoPrevio?.miniaturaOriginal ?? fila.thumbnailPath ?? undefined,
        intentos,
        tomadaEn: ahora.toISOString(),
    }

    const destino = rutaLimpia(fila.storagePath)
    const miniatura = rutaMiniatura(destino)

    let urlOrigen: string
    let urlDestino: string
    let urlMiniatura: string | undefined
    try {
        ;[urlOrigen, urlDestino, urlMiniatura] = await Promise.all([
            deps.urlLectura(fila.storagePath),
            deps.urlEscritura(destino),
            fila.mediaType === 'IMAGE' ? deps.urlEscritura(miniatura) : Promise.resolve(undefined),
        ])
    } catch (err) {
        deps.registrar(`[aiMarks] ${generationId} firmar-urls`, err)
        return await reintentarOFallar(generationId, base, deps, String(err))
    }

    const resultado = await deps.cliente.limpiar({
        jobId: generationId,
        mediaType: fila.mediaType,
        urlOrigen,
        urlDestino,
        contentType: tipoDeContenido(destino),
        cacheControl: CACHE_INMUTABLE,
        urlMiniatura,
        proveedor: fila.proveedor,
    })

    if (!resultado.ok) {
        deps.registrar(`[aiMarks] ${generationId} limpiar (${resultado.motivo}): ${resultado.mensaje}`)
        return await reintentarOFallar(generationId, base, deps, resultado.mensaje)
    }

    const informe = resultado.informe

    // El motor no escribió nada: no había marcas. La fila conserva su ruta
    // original y NO se cobra.
    if (!informe.escribioSalida) {
        const estadoFinal: EstadoPersistido = {
            ...base,
            informe,
            terminadaEn: deps.ahora().toISOString(),
        }
        await deps.guardar(generationId, { estado: 'no_marks', aiMarks: estadoFinal })
        return {
            estado: 'no_marks',
            informe,
            rutaFinal: fila.storagePath,
            tokensCobrados: 0,
        }
    }

    // Se escribió el objeto limpio: la fila pasa a servirlo.
    const estadoFila: Extract<EstadoAiMarks, 'cleaned' | 'partial'> =
        informe.estado === 'partial' ? 'partial' : 'cleaned'
    const ahoraFin = deps.ahora()
    const estadoFinal: EstadoPersistido = {
        ...base,
        informe,
        rutaLimpia: destino,
        miniaturaLimpia: informe.escribioMiniatura ? miniatura : undefined,
        terminadaEn: ahoraFin.toISOString(),
        // El original se conserva un rato: una pestaña abierta puede estar
        // reproduciendo el vídeo viejo mientras se cambia la fila.
        purgarOriginalTras: new Date(
            ahoraFin.getTime() + MS_ANTES_DE_PURGAR_ORIGINAL,
        ).toISOString(),
    }

    const guardado = await deps.guardar(generationId, {
        estado: estadoFila,
        aiMarks: estadoFinal,
        storagePath: destino,
        thumbnailPath: informe.escribioMiniatura ? miniatura : fila.thumbnailPath,
    })

    // Cero filas afectadas = la generación se borró mientras se limpiaba. Los
    // objetos que acabamos de escribir no los referencia nadie: se borran aquí
    // en vez de esperar al barrido de huérfanos.
    if (guardado.filasAfectadas === 0) {
        deps.registrar(`[aiMarks] ${generationId} la fila desapareció; se borra el limpio`)
        await deps.borrarObjeto(destino).catch((err) => {
            deps.registrar(`[aiMarks] ${generationId} borrar-limpio-huérfano`, err)
        })
        if (informe.escribioMiniatura) {
            await deps.borrarObjeto(miniatura).catch(() => undefined)
        }
        return { estado: 'no_tomado' }
    }

    let tokensCobrados = 0
    if (debeCobrar(informe)) {
        const cotizacion = cotizar(informe, fila.mediaType)
        const cobro = await deps.cobrar({
            organizationId: fila.organizationId,
            userId: fila.userId,
            generationId,
            tokens: cotizacion.tokens,
            sku: cotizacion.sku,
            costUsd: cotizacion.costUsd,
            idempotencyKey: claveDeCobro(generationId),
            informe,
        })
        if ('error' in cobro) {
            // Un fallo de cobro NO deshace la limpieza: el tenant ya tiene su
            // archivo limpio. Se anota para poder reclamarlo después.
            deps.registrar(`[aiMarks] ${generationId} cobrar: ${cobro.error}`)
            await deps.guardar(generationId, {
                estado: estadoFila,
                aiMarks: { ...estadoFinal, errorCobro: cobro.error },
            })
        } else {
            tokensCobrados = cobro.tokens
            await deps.guardar(generationId, {
                estado: estadoFila,
                aiMarks: { ...estadoFinal, tokensCobrados },
            })
        }
    }

    return { estado: estadoFila, informe, rutaFinal: destino, tokensCobrados }
}

async function reintentarOFallar(
    generationId: string,
    base: EstadoPersistido,
    deps: Dependencias,
    error: string,
): Promise<DesenlaceTrabajo> {
    if (base.intentos >= MAX_INTENTOS) {
        await deps.guardar(generationId, {
            estado: 'failed',
            aiMarks: { ...base, error, terminadaEn: deps.ahora().toISOString() },
        })
        deps.registrar(
            `[aiMarks] ${generationId} AGOTADOS ${base.intentos} intentos; se sirve el original: ${error}`,
        )
        return { estado: 'fallido', intentos: base.intentos, error }
    }
    const siguiente = new Date(deps.ahora().getTime() + siguienteEspera(base.intentos - 1))
    await deps.guardar(generationId, {
        estado: 'pending',
        aiMarks: { ...base, error, siguienteIntentoEn: siguiente.toISOString() },
    })
    return { estado: 'reintento_programado', intentos: base.intentos, error }
}
