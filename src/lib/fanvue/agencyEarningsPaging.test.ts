// src/lib/fanvue/agencyEarningsPaging.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collectAgencyEarnings } from './agencyEarningsPaging.ts'
import type { FanvueAgencyEarningsResponse } from './types.ts'

/**
 * INCIDENTE 2026-09-19 — "el dashboard no muestra la cantidad real de Fanvue".
 *
 * `/v1/agencies/earnings` pagina por `page` y responde
 * `{data, pagination:{page,size,hasMore}}`. El cliente mandaba `cursor` y leía
 * un `nextCursor` QUE ESE ENDPOINT NO TIENE — comprobado en vivo contra la API:
 * con `size:1` sobre una ventana con 2 días de ingresos devuelve
 * `{"pagination":{"page":1,"size":1,"hasMore":true}}` y ningún cursor.
 *
 * Como `nextCursor` salía `undefined`, el bucle cortaba en la página 1 y
 * devolvía `truncated: false` — AFIRMANDO que había traído todo. Y el sync
 * escribe un 0 en cada (creator, día) que no vino, así que las páginas no
 * leídas no quedaban "sin datos": quedaban en CERO, pisando ingresos reales.
 *
 * No se notaba porque la ventana diaria (4 creators × 3 días = 12 filas) nunca
 * pasa de una página de 50. Un backfill sí: 12 creators × 90 días ≈ 1.080.
 */

const fila = (date: string, gross: number) => ({
    creatorUuid: 'c1',
    date,
    gross,
    net: Math.round(gross * 0.8),
    currency: 'USD',
})

function paginador(paginas: FanvueAgencyEarningsResponse[]) {
    const pedidas: number[] = []
    return {
        pedidas,
        fetch: async (page: number) => {
            pedidas.push(page)
            return (
                paginas[page - 1] ?? {
                    data: [],
                    pagination: { page, size: 50, hasMore: false },
                }
            )
        },
    }
}

test('EL BUG: sigue pidiendo páginas mientras hasMore sea true', async () => {
    const p = paginador([
        {
            data: [fila('2026-09-15', 3500)],
            pagination: { page: 1, size: 1, hasMore: true },
        },
        {
            data: [fila('2026-09-03', 700)],
            pagination: { page: 2, size: 1, hasMore: true },
        },
        {
            data: [fila('2026-09-01', 100)],
            pagination: { page: 3, size: 1, hasMore: false },
        },
    ])
    const r = await collectAgencyEarnings(p.fetch, { maxPages: 10 })
    assert.deepEqual(p.pedidas, [1, 2, 3], 'debe pedir las tres páginas')
    assert.equal(
        r.rows.length,
        3,
        'antes se quedaba con 1 y juraba que era todo',
    )
    assert.equal(r.truncated, false)
})

test('una sola página con hasMore false no pide una segunda', async () => {
    const p = paginador([
        {
            data: [fila('2026-09-15', 3500)],
            pagination: { page: 1, size: 50, hasMore: false },
        },
    ])
    const r = await collectAgencyEarnings(p.fetch, { maxPages: 10 })
    assert.deepEqual(p.pedidas, [1])
    assert.equal(r.rows.length, 1)
    assert.equal(r.truncated, false)
})

/**
 * `truncated` es la señal de "NO te fíes, la ventana quedó incompleta". Tiene
 * que ser CIERTA: el sync escribe ceros con lo que reciba, así que un
 * `truncated:false` mentiroso es lo que convierte una página perdida en
 * ingresos borrados.
 */
test('si se agota maxPages con hasMore true, truncated es TRUE', async () => {
    const p = paginador([
        {
            data: [fila('2026-09-15', 3500)],
            pagination: { page: 1, size: 1, hasMore: true },
        },
        {
            data: [fila('2026-09-03', 700)],
            pagination: { page: 2, size: 1, hasMore: true },
        },
        {
            data: [fila('2026-09-01', 100)],
            pagination: { page: 3, size: 1, hasMore: true },
        },
    ])
    const r = await collectAgencyEarnings(p.fetch, { maxPages: 2 })
    assert.equal(r.rows.length, 2)
    assert.equal(r.truncated, true, 'quedó gente fuera: hay que gritarlo')
})

test('una página vacía corta el bucle aunque hasMore mienta', async () => {
    const p = paginador([
        {
            data: [fila('2026-09-15', 3500)],
            pagination: { page: 1, size: 1, hasMore: true },
        },
        { data: [], pagination: { page: 2, size: 1, hasMore: true } },
    ])
    const r = await collectAgencyEarnings(p.fetch, { maxPages: 10 })
    assert.equal(r.rows.length, 1)
    assert.deepEqual(p.pedidas, [1, 2], 'no da vueltas para siempre')
})
