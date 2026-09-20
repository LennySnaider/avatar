/**
 * Cliente del servicio limpiador. Habla HTTP, nunca manda bytes de medios.
 *
 * Se define como interfaz para poder inyectar uno falso en las pruebas de
 * `runJob` sin levantar un contenedor.
 */
import type { InformeLimpieza, ResultadoServicio } from './types'

/** Lo que hay que limpiar y a dónde dejarlo. Sólo URLs, nunca bytes. */
export interface TrabajoLimpieza {
    jobId: string
    mediaType: 'IMAGE' | 'VIDEO'
    urlOrigen: string
    urlDestino: string
    contentType: string
    cacheControl?: string
    urlMiniatura?: string
    /** `metadata.providerName` de la fila. Evita falsos positivos del detector. */
    proveedor?: string | null
}

export interface ClienteLimpiador {
    limpiar(trabajo: TrabajoLimpieza): Promise<ResultadoServicio>
    salud(): Promise<{ ok: boolean; modeloCargado: boolean } | { ok: false; error: string }>
}

/**
 * Topes de espera. El de vídeo es alto porque rellenar fotograma a fotograma
 * llega a 115 s medidos; el de imagen es corto porque 3 s es lo normal y una
 * imagen que tarda 90 s es una avería, no un archivo difícil.
 */
export const TIMEOUT_IMAGEN_MS = 90_000
export const TIMEOUT_VIDEO_MS = 600_000

function mensajeDeError(err: unknown): string {
    if (err instanceof Error) return err.message
    return String(err)
}

/** Cliente real contra el servicio en contenedor. */
export function crearClienteHttp(opciones: {
    baseUrl: string
    secreto: string
    fetchImpl?: typeof fetch
}): ClienteLimpiador {
    const hacerFetch = opciones.fetchImpl ?? fetch
    const base = opciones.baseUrl.replace(/\/+$/, '')

    return {
        async salud() {
            try {
                const respuesta = await hacerFetch(`${base}/health`, {
                    method: 'GET',
                    headers: { 'X-Cleaner-Secret': opciones.secreto },
                    signal: AbortSignal.timeout(5_000),
                })
                if (!respuesta.ok) {
                    return { ok: false as const, error: `health ${respuesta.status}` }
                }
                const cuerpo = (await respuesta.json()) as {
                    ok?: boolean
                    modeloCargado?: boolean
                }
                return {
                    ok: cuerpo.ok === true,
                    modeloCargado: cuerpo.modeloCargado === true,
                }
            } catch (err) {
                return { ok: false as const, error: mensajeDeError(err) }
            }
        },

        async limpiar(trabajo) {
            const esVideo = trabajo.mediaType === 'VIDEO'
            const cuerpo = {
                jobId: trabajo.jobId,
                mediaType: esVideo ? 'video' : 'image',
                source: { getUrl: trabajo.urlOrigen },
                output: {
                    putUrl: trabajo.urlDestino,
                    contentType: trabajo.contentType,
                    cacheControl: trabajo.cacheControl,
                },
                thumbnail: trabajo.urlMiniatura ? { putUrl: trabajo.urlMiniatura } : null,
                options: { proveedor: trabajo.proveedor ?? null },
            }

            let respuesta: Response
            try {
                respuesta = await hacerFetch(`${base}/v1/clean`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Cleaner-Secret': opciones.secreto,
                    },
                    body: JSON.stringify(cuerpo),
                    signal: AbortSignal.timeout(
                        esVideo ? TIMEOUT_VIDEO_MS : TIMEOUT_IMAGEN_MS,
                    ),
                })
            } catch (err) {
                // `TimeoutError` merece reintento; un fallo de red también, pero
                // se distinguen para que el log diga cuál de los dos fue.
                const esTimeout = err instanceof Error && err.name === 'TimeoutError'
                return {
                    ok: false,
                    motivo: esTimeout ? 'timeout' : 'red',
                    mensaje: mensajeDeError(err),
                }
            }

            if (respuesta.status === 429) {
                // El servicio está lleno. No es una avería: se reintenta.
                return { ok: false, motivo: 'ocupado', estadoHttp: 429, mensaje: 'servicio ocupado' }
            }
            if (!respuesta.ok) {
                const detalle = await respuesta.text().catch(() => '')
                return {
                    ok: false,
                    motivo: 'http',
                    estadoHttp: respuesta.status,
                    mensaje: detalle.slice(0, 300) || `http ${respuesta.status}`,
                }
            }

            try {
                const informe = (await respuesta.json()) as InformeLimpieza
                return { ok: true, informe }
            } catch (err) {
                // Un 200 con cuerpo ilegible es un fallo del servicio, no un
                // "no había marcas": se informa como tal para que se reintente.
                return { ok: false, motivo: 'http', estadoHttp: 200, mensaje: mensajeDeError(err) }
            }
        },
    }
}

/**
 * Lee la configuración del entorno.
 *
 * Devuelve la causa exacta cuando falta algo, en vez de un `null` que obligaría
 * a quien llama a adivinar si el módulo está apagado o mal configurado.
 */
export function clienteDesdeEntorno(
    env: Record<string, string | undefined> = process.env,
): { ok: true; cliente: ClienteLimpiador } | { ok: false; error: string } {
    const baseUrl = env.AI_MARKS_CLEANER_URL
    const secreto = env.AI_MARKS_CLEANER_SECRET
    if (!baseUrl) return { ok: false, error: 'falta AI_MARKS_CLEANER_URL' }
    if (!secreto) return { ok: false, error: 'falta AI_MARKS_CLEANER_SECRET' }
    return { ok: true, cliente: crearClienteHttp({ baseUrl, secreto }) }
}
