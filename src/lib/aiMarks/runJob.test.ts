import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ejecutarTrabajo, MAX_INTENTOS, type Dependencias, type FilaGeneracion } from './runJob.ts'
import type { InformeLimpieza, ResultadoServicio } from './types.ts'

const AHORA = new Date('2026-09-20T12:00:00.000Z')

function fila(cambios: Partial<FilaGeneracion> = {}): FilaGeneracion {
    return {
        id: 'gen-1',
        organizationId: 'org-1',
        userId: 'user-1',
        mediaType: 'IMAGE',
        storagePath: 'org/org-1/images/1726.png',
        thumbnailPath: 'thumbs/org/org-1/images/1726.png.jpg',
        estado: 'pending',
        aiMarks: null,
        proveedor: 'Gemini 3.1 Flash Lite Image',
        ...cambios,
    }
}

function informe(cambios: Partial<InformeLimpieza> = {}): InformeLimpieza {
    return {
        estado: 'cleaned',
        visibles: [],
        metadatos: { encontrados: ['c2pa'], removidos: ['c2pa'], sobrevivientes: [] },
        backend: 'migan',
        versionMotor: '0.41.1',
        duracionMs: 2200,
        escribioSalida: true,
        escribioMiniatura: true,
        ...cambios,
    }
}

interface Espia {
    deps: Dependencias
    guardados: Array<{ estado: string; storagePath?: string; aiMarks: Record<string, unknown> }>
    borrados: string[]
    cobros: Array<{ tokens: number; idempotencyKey: string }>
    registros: string[]
}

function espia(opciones: {
    filaTomada?: FilaGeneracion | null
    respuesta?: ResultadoServicio
    filasAfectadas?: number
    cobro?: { tokens: number } | { error: string }
}): Espia {
    const guardados: Espia['guardados'] = []
    const borrados: string[] = []
    const cobros: Espia['cobros'] = []
    const registros: string[] = []
    const deps: Dependencias = {
        tomar: async () =>
            opciones.filaTomada === undefined ? fila() : opciones.filaTomada,
        guardar: async (_id, cambios) => {
            guardados.push({
                estado: cambios.estado,
                storagePath: cambios.storagePath,
                aiMarks: cambios.aiMarks as unknown as Record<string, unknown>,
            })
            return { filasAfectadas: opciones.filasAfectadas ?? 1 }
        },
        urlLectura: async (ruta) => `https://r2/get/${ruta}`,
        urlEscritura: async (ruta) => `https://r2/put/${ruta}`,
        borrarObjeto: async (ruta) => {
            borrados.push(ruta)
        },
        cliente: {
            limpiar: async () =>
                opciones.respuesta ?? { ok: true, informe: informe() },
            salud: async () => ({ ok: true, modeloCargado: true }),
        },
        cobrar: async (entrada) => {
            cobros.push({ tokens: entrada.tokens, idempotencyKey: entrada.idempotencyKey })
            return opciones.cobro ?? { tokens: entrada.tokens }
        },
        ahora: () => AHORA,
        registrar: (mensaje) => registros.push(mensaje),
    }
    return { deps, guardados, borrados, cobros, registros }
}

describe('ejecutarTrabajo', () => {
    it('si otro trabajador se la llevó, no hace nada', async () => {
        const e = espia({ filaTomada: null })
        const r = await ejecutarTrabajo('gen-1', e.deps)
        assert.deepEqual(r, { estado: 'no_tomado' })
        assert.equal(e.guardados.length, 0)
    })

    it('limpieza correcta: la fila pasa a servir el objeto limpio y se cobra', async () => {
        const e = espia({})
        const r = await ejecutarTrabajo('gen-1', e.deps)
        assert.equal(r.estado, 'cleaned')
        assert.equal(
            r.estado === 'cleaned' ? r.rutaFinal : '',
            'org/org-1/images/1726.clean.png',
        )
        assert.equal(e.guardados[0].storagePath, 'org/org-1/images/1726.clean.png')
        assert.equal(e.cobros.length, 1)
        assert.equal(e.cobros[0].idempotencyKey, 'ai_mark_clean:gen-1')
    })

    it('el original se conserva un rato antes de purgarlo', async () => {
        // Una pestaña abierta puede estar reproduciendo el vídeo viejo.
        const e = espia({})
        await ejecutarTrabajo('gen-1', e.deps)
        const purgar = e.guardados[0].aiMarks.purgarOriginalTras as string
        assert.ok(Date.parse(purgar) > AHORA.getTime())
        assert.equal(e.borrados.length, 0, 'no se borra nada en el momento')
    })

    it('sin marcas: la ruta no cambia y NO se cobra', async () => {
        const e = espia({
            respuesta: {
                ok: true,
                informe: informe({
                    estado: 'no_marks',
                    escribioSalida: false,
                    escribioMiniatura: false,
                    metadatos: { encontrados: [], removidos: [], sobrevivientes: [] },
                }),
            },
        })
        const r = await ejecutarTrabajo('gen-1', e.deps)
        assert.equal(r.estado, 'no_marks')
        assert.equal(e.guardados[0].storagePath, undefined, 'la ruta no cambia')
        assert.equal(e.cobros.length, 0)
    })

    it('parcial se sirve igual: mejor casi limpio que sucio', async () => {
        const e = espia({
            respuesta: { ok: true, informe: informe({ estado: 'partial' }) },
        })
        const r = await ejecutarTrabajo('gen-1', e.deps)
        assert.equal(r.estado, 'partial')
        assert.equal(e.guardados[0].storagePath, 'org/org-1/images/1726.clean.png')
    })

    it('servicio ocupado: reintento programado, no fallo', async () => {
        const e = espia({
            respuesta: { ok: false, motivo: 'ocupado', mensaje: 'lleno' },
        })
        const r = await ejecutarTrabajo('gen-1', e.deps)
        assert.equal(r.estado, 'reintento_programado')
        assert.equal(e.guardados[0].estado, 'pending')
        assert.ok(e.guardados[0].aiMarks.siguienteIntentoEn)
    })

    it('tras agotar los intentos se rinde y deja servir el original', async () => {
        const e = espia({
            filaTomada: fila({
                aiMarks: {
                    rutaOriginal: 'org/org-1/images/1726.png',
                    intentos: MAX_INTENTOS - 1,
                    registradaEn: AHORA.toISOString(),
                },
            }),
            respuesta: { ok: false, motivo: 'timeout', mensaje: 'tardó demasiado' },
        })
        const r = await ejecutarTrabajo('gen-1', e.deps)
        assert.equal(r.estado, 'fallido')
        assert.equal(e.guardados[0].estado, 'failed')
        assert.ok(e.registros.some((m) => m.includes('AGOTADOS')), 'el fallo se grita en el log')
    })

    it('si la generación se borró mientras se limpiaba, no deja objetos huérfanos', async () => {
        const e = espia({ filasAfectadas: 0 })
        const r = await ejecutarTrabajo('gen-1', e.deps)
        assert.equal(r.estado, 'no_tomado')
        assert.ok(e.borrados.includes('org/org-1/images/1726.clean.png'))
        assert.equal(e.cobros.length, 0, 'no se cobra por una fila que ya no existe')
    })

    it('un fallo de cobro NO deshace la limpieza', async () => {
        // El tenant ya tiene su archivo limpio; se anota para reclamar después.
        const e = espia({ cobro: { error: 'monedero caído' } })
        const r = await ejecutarTrabajo('gen-1', e.deps)
        assert.equal(r.estado, 'cleaned')
        const ultimo = e.guardados[e.guardados.length - 1]
        assert.equal(ultimo.aiMarks.errorCobro, 'monedero caído')
    })

    it('el vídeo no pide URL de miniatura', async () => {
        const pedidas: string[] = []
        const e = espia({ filaTomada: fila({ mediaType: 'VIDEO', storagePath: 'org/org-1/videos/1.mp4' }) })
        const original = e.deps.urlEscritura
        e.deps.urlEscritura = async (ruta) => {
            pedidas.push(ruta)
            return original(ruta)
        }
        await ejecutarTrabajo('gen-1', e.deps)
        assert.deepEqual(pedidas, ['org/org-1/videos/1.clean.mp4'])
    })

    it('le pasa el proveedor al servicio, que es lo que evita el falso positivo', async () => {
        let recibido: string | null | undefined
        const e = espia({})
        e.deps.cliente.limpiar = async (trabajo) => {
            recibido = trabajo.proveedor
            return { ok: true, informe: informe() }
        }
        await ejecutarTrabajo('gen-1', e.deps)
        assert.equal(recibido, 'Gemini 3.1 Flash Lite Image')
    })
})
