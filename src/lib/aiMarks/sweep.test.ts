import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { barrer, type Candidata, type DependenciasBarrido, type Purgable } from './sweep.ts'
import type { DesenlaceTrabajo, EstadoPersistido } from './types.ts'

const AHORA = new Date('2026-09-20T12:00:00.000Z')

function estadoPersistido(): EstadoPersistido {
    return { rutaOriginal: 'org/o1/images/1.png', intentos: 1, registradaEn: AHORA.toISOString() }
}

function deps(opciones: {
    pendientes?: Candidata[]
    purgables?: Purgable[]
    sano?: boolean
    desenlace?: (id: string) => Promise<DesenlaceTrabajo>
}): { d: DependenciasBarrido; ejecutadas: string[]; borrados: string[]; registros: string[] } {
    const ejecutadas: string[] = []
    const borrados: string[] = []
    const registros: string[] = []
    return {
        ejecutadas,
        borrados,
        registros,
        d: {
            buscarPendientes: async () => opciones.pendientes ?? [],
            buscarPurgables: async () => opciones.purgables ?? [],
            ejecutar: async (id) => {
                ejecutadas.push(id)
                return (
                    (await opciones.desenlace?.(id)) ?? {
                        estado: 'cleaned',
                        informe: {
                            estado: 'cleaned',
                            visibles: [],
                            metadatos: { encontrados: [], removidos: ['c2pa'], sobrevivientes: [] },
                            backend: 'migan',
                            versionMotor: '0.41.1',
                            duracionMs: 1,
                            escribioSalida: true,
                            escribioMiniatura: true,
                        },
                        rutaFinal: 'x.clean.png',
                        tokensCobrados: 10,
                    }
                )
            },
            borrarObjeto: async (ruta) => {
                borrados.push(ruta)
            },
            marcarPurgada: async () => undefined,
            servicioSano: async () => opciones.sano ?? true,
            ahora: () => AHORA,
            registrar: (m) => registros.push(m),
        },
    }
}

describe('barrer', () => {
    it('sin trabajo no hace nada y lo dice', async () => {
        const { d } = deps({})
        const r = await barrer(d)
        assert.equal(r.tomadas, 0)
        assert.equal(r.omitidoPorServicioCaido, false)
    })

    it('con el limpiador caído NO toma trabajo, para no quemar los intentos', async () => {
        // Una caída de media hora dejaría en `failed` todo lo que había en
        // vuelo, sin que hubiera nada malo en esas filas.
        const { d, ejecutadas } = deps({
            sano: false,
            pendientes: [{ id: 'g1', mediaType: 'IMAGE' }],
        })
        const r = await barrer(d)
        assert.equal(r.omitidoPorServicioCaido, true)
        assert.deepEqual(ejecutadas, [])
    })

    it('la purga sí corre aunque el limpiador esté caído', async () => {
        // Son borrados en R2 de objetos ya sustituidos: no dependen del motor.
        const { d, borrados } = deps({
            sano: false,
            purgables: [
                {
                    id: 'g1',
                    rutaOriginal: 'org/o1/images/1.png',
                    miniaturaOriginal: 'thumbs/org/o1/images/1.png.jpg',
                    aiMarks: estadoPersistido(),
                },
            ],
        })
        const r = await barrer(d)
        assert.equal(r.purgadas, 1)
        assert.deepEqual(borrados, ['org/o1/images/1.png', 'thumbs/org/o1/images/1.png.jpg'])
    })

    it('respeta los topes: muchas imágenes, pocos vídeos', async () => {
        const muchas: Candidata[] = [
            ...Array.from({ length: 30 }, (_, i) => ({ id: `img-${i}`, mediaType: 'IMAGE' as const })),
            ...Array.from({ length: 10 }, (_, i) => ({ id: `vid-${i}`, mediaType: 'VIDEO' as const })),
        ]
        const { d, ejecutadas } = deps({ pendientes: muchas })
        await barrer(d)
        assert.equal(ejecutadas.filter((i) => i.startsWith('img')).length, 20)
        assert.equal(ejecutadas.filter((i) => i.startsWith('vid')).length, 3)
    })

    it('una fila que revienta no tumba la pasada', async () => {
        const { d, ejecutadas, registros } = deps({
            pendientes: [
                { id: 'buena-1', mediaType: 'IMAGE' },
                { id: 'mala', mediaType: 'IMAGE' },
                { id: 'buena-2', mediaType: 'IMAGE' },
            ],
            desenlace: async (id) => {
                if (id === 'mala') throw new Error('boom')
                return { estado: 'no_marks', informe: {} as never, rutaFinal: 'x', tokensCobrados: 0 }
            },
        })
        const r = await barrer(d)
        assert.equal(ejecutadas.length, 3, 'se intentaron las tres')
        assert.equal(r.fallidas, 1)
        assert.ok(registros.some((m) => m.includes('reventó')))
    })

    it('cuenta cada desenlace en su casilla', async () => {
        const porId: Record<string, DesenlaceTrabajo> = {
            a: { estado: 'cleaned', informe: {} as never, rutaFinal: 'x', tokensCobrados: 10 },
            b: { estado: 'no_marks', informe: {} as never, rutaFinal: 'x', tokensCobrados: 0 },
            c: { estado: 'reintento_programado', intentos: 1, error: 'ocupado' },
            d: { estado: 'no_tomado' },
        }
        const { d } = deps({
            pendientes: Object.keys(porId).map((id) => ({ id, mediaType: 'IMAGE' as const })),
            desenlace: async (id) => porId[id],
        })
        const r = await barrer(d)
        assert.equal(r.limpiadas, 1)
        assert.equal(r.sinMarcas, 1)
        assert.equal(r.reintentos, 1)
        assert.equal(r.tomadas, 3, 'la no tomada no cuenta')
    })

    it('un original que no se puede borrar no bloquea a los demás', async () => {
        const { d, registros } = deps({
            purgables: [
                { id: 'g1', rutaOriginal: 'rota', aiMarks: estadoPersistido() },
                { id: 'g2', rutaOriginal: 'buena', aiMarks: estadoPersistido() },
            ],
        })
        d.borrarObjeto = async (ruta) => {
            if (ruta === 'rota') throw new Error('403')
        }
        const r = await barrer(d)
        assert.equal(r.purgadas, 1)
        assert.ok(registros.some((m) => m.includes('no se pudo purgar')))
    })
})
