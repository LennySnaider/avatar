import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { lanzarLimpieza } from './register.ts'
import type { DesenlaceTrabajo } from './types.ts'

const LIMPIA: DesenlaceTrabajo = {
    estado: 'cleaned',
    informe: {} as never,
    rutaFinal: 'org/o1/images/1.clean.png',
    tokensCobrados: 10,
}

describe('lanzarLimpieza', () => {
    it('no hace nada si la fila no nació pendiente', async () => {
        let llamadas = 0
        const r = await lanzarLimpieza({
            generationId: 'g1',
            mediaType: 'IMAGE',
            estadoInicial: 'skipped',
            ejecutar: async () => {
                llamadas += 1
                return LIMPIA
            },
            diferir: () => undefined,
        })
        assert.deepEqual(r, { estado: 'no_aplica' })
        assert.equal(llamadas, 0)
    })

    it('una imagen rápida devuelve la fila ya limpia', async () => {
        const r = await lanzarLimpieza({
            generationId: 'g1',
            mediaType: 'IMAGE',
            estadoInicial: 'pending',
            ejecutar: async () => LIMPIA,
            diferir: () => undefined,
            presupuestoMs: 1000,
        })
        assert.equal(r.estado, 'terminado')
        assert.equal(r.estado === 'terminado' ? r.desenlace.estado : '', 'cleaned')
    })

    it('una imagen lenta no bloquea el guardado: pasa a segundo plano', async () => {
        const diferidas: Array<() => Promise<unknown>> = []
        const r = await lanzarLimpieza({
            generationId: 'g1',
            mediaType: 'IMAGE',
            estadoInicial: 'pending',
            ejecutar: () => new Promise((res) => setTimeout(() => res(LIMPIA), 200)),
            diferir: (t) => diferidas.push(t),
            presupuestoMs: 20,
        })
        assert.deepEqual(r, { estado: 'en_segundo_plano' })
        assert.equal(diferidas.length, 1, 'el trabajo sigue vivo, no se abandona')
        await diferidas[0]()
    })

    it('un vídeo NUNCA se espera, por rápido que sea', async () => {
        // El cliente guarda con un tope de 30 s; un vídeo no cabe ahí.
        const diferidas: Array<() => Promise<unknown>> = []
        const r = await lanzarLimpieza({
            generationId: 'g1',
            mediaType: 'VIDEO',
            estadoInicial: 'pending',
            ejecutar: async () => LIMPIA,
            diferir: (t) => diferidas.push(t),
            presupuestoMs: 10_000,
        })
        assert.deepEqual(r, { estado: 'en_segundo_plano' })
        assert.equal(diferidas.length, 1)
    })

    it('un trabajo que revienta no tumba el guardado', async () => {
        const r = await lanzarLimpieza({
            generationId: 'g1',
            mediaType: 'IMAGE',
            estadoInicial: 'pending',
            ejecutar: async () => {
                throw new Error('boom')
            },
            diferir: () => undefined,
            presupuestoMs: 1000,
        })
        assert.equal(r.estado, 'terminado')
        assert.equal(r.estado === 'terminado' ? r.desenlace.estado : '', 'fallido')
    })
})
