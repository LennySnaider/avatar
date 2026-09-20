import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { clienteDesdeEntorno, crearClienteHttp, type TrabajoLimpieza } from './client.ts'

const TRABAJO: TrabajoLimpieza = {
    jobId: 'gen-1',
    mediaType: 'IMAGE',
    urlOrigen: 'https://r2/origen.png',
    urlDestino: 'https://r2/destino.clean.png',
    contentType: 'image/png',
    proveedor: 'Gemini 3.1 Flash Lite Image',
}

function clienteCon(respuesta: () => Promise<Response>) {
    return crearClienteHttp({
        baseUrl: 'http://limpiador',
        secreto: 's3cr3t',
        fetchImpl: respuesta as unknown as typeof fetch,
    })
}

describe('crearClienteHttp.limpiar', () => {
    it('manda URLs y proveedor, nunca bytes', async () => {
        let capturado: { url: string; init: RequestInit } | null = null
        const cliente = crearClienteHttp({
            baseUrl: 'http://limpiador/',
            secreto: 's3cr3t',
            fetchImpl: (async (url: string, init: RequestInit) => {
                capturado = { url, init }
                return new Response(JSON.stringify({ estado: 'cleaned' }), { status: 200 })
            }) as unknown as typeof fetch,
        })
        await cliente.limpiar(TRABAJO)
        assert.ok(capturado)
        assert.equal(capturado!.url, 'http://limpiador/v1/clean')
        const enviado = JSON.parse(capturado!.init.body as string)
        assert.equal(enviado.source.getUrl, TRABAJO.urlOrigen)
        assert.equal(enviado.options.proveedor, TRABAJO.proveedor)
        assert.equal(enviado.mediaType, 'image')
        const cabeceras = capturado!.init.headers as Record<string, string>
        assert.equal(cabeceras['X-Cleaner-Secret'], 's3cr3t')
    })

    it('un 429 se reporta como "ocupado", no como avería', async () => {
        // De esto depende que el barrido no queme uno de sus tres intentos.
        const cliente = clienteCon(async () => new Response('{}', { status: 429 }))
        const r = await cliente.limpiar(TRABAJO)
        assert.equal(r.ok, false)
        assert.equal(r.ok === false && r.motivo, 'ocupado')
    })

    it('distingue el timeout del fallo de red', async () => {
        const timeout = clienteCon(async () => {
            const err = new Error('tardó demasiado')
            err.name = 'TimeoutError'
            throw err
        })
        const rTimeout = await timeout.limpiar(TRABAJO)
        assert.equal(rTimeout.ok === false && rTimeout.motivo, 'timeout')

        const red = clienteCon(async () => {
            throw new Error('ECONNREFUSED')
        })
        const rRed = await red.limpiar(TRABAJO)
        assert.equal(rRed.ok === false && rRed.motivo, 'red')
    })

    it('un 200 con cuerpo ilegible NO se confunde con "no había marcas"', async () => {
        const cliente = clienteCon(async () => new Response('no soy json', { status: 200 }))
        const r = await cliente.limpiar(TRABAJO)
        assert.equal(r.ok, false)
        assert.equal(r.ok === false && r.motivo, 'http')
    })

    it('un 4xx lleva el código y el detalle', async () => {
        const cliente = clienteCon(
            async () => new Response('host no permitido', { status: 400 }),
        )
        const r = await cliente.limpiar(TRABAJO)
        assert.equal(r.ok === false && r.estadoHttp, 400)
        assert.match(r.ok === false ? r.mensaje : '', /host no permitido/)
    })

    it('un 200 con informe lo devuelve tal cual', async () => {
        const informe = { estado: 'cleaned', visibles: [], escribioSalida: true }
        const cliente = clienteCon(
            async () => new Response(JSON.stringify(informe), { status: 200 }),
        )
        const r = await cliente.limpiar(TRABAJO)
        assert.equal(r.ok, true)
        assert.equal(r.ok === true && r.informe.estado, 'cleaned')
    })
})

describe('clienteDesdeEntorno', () => {
    it('dice QUÉ falta en vez de devolver un nulo mudo', () => {
        assert.deepEqual(clienteDesdeEntorno({}), {
            ok: false,
            error: 'falta AI_MARKS_CLEANER_URL',
        })
        assert.deepEqual(clienteDesdeEntorno({ AI_MARKS_CLEANER_URL: 'http://x' }), {
            ok: false,
            error: 'falta AI_MARKS_CLEANER_SECRET',
        })
    })

    it('construye el cliente cuando la configuración está completa', () => {
        const r = clienteDesdeEntorno({
            AI_MARKS_CLEANER_URL: 'http://x',
            AI_MARKS_CLEANER_SECRET: 's',
        })
        assert.equal(r.ok, true)
    })
})
