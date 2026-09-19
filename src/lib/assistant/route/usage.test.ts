// src/lib/assistant/route/usage.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    USAGE_ROWS_LIMIT,
    sumTokensCharged,
    usageMaybeTruncated,
    utcDayStart,
} from './usage.ts'

test('sumTokensCharged: suma las filas del día', () => {
    assert.equal(
        sumTokensCharged([
            { tokens_charged: 100 },
            { tokens_charged: 250 },
            { tokens_charged: 0 },
        ]),
        350,
    )
})

test('sumTokensCharged: sin filas, cero (no undefined, no NaN)', () => {
    assert.equal(sumTokensCharged([]), 0)
})

test('sumTokensCharged: una fila con basura vale 0 y NO contamina la suma', () => {
    // Un NaN en una suma la convierte entera en NaN, y un presupuesto NaN
    // comparado con el tope da `false` en todo: el usuario se quedaría sin
    // asistente por una sola fila rota.
    assert.equal(
        sumTokensCharged([
            { tokens_charged: 100 },
            { tokens_charged: null },
            { tokens_charged: undefined },
            { tokens_charged: 'muchos' },
            { tokens_charged: Number.NaN },
            { tokens_charged: -50 },
            {},
        ] as { tokens_charged?: unknown }[]),
        100,
    )
})

test('utcDayStart: la medianoche UTC del día que se le pasa', () => {
    assert.equal(
        utcDayStart(new Date('2026-09-18T23:59:59.999Z')),
        '2026-09-18T00:00:00.000Z',
    )
    assert.equal(
        utcDayStart(new Date('2026-09-19T00:00:00.000Z')),
        '2026-09-19T00:00:00.000Z',
    )
})

test('utcDayStart: usa UTC y no la zona del servidor', () => {
    // Un instante que en cualquier zona al oeste de Greenwich es "el día
    // anterior". El corte tiene que ser el de UTC, que es el mismo para todos
    // los procesos que lean el contador.
    assert.equal(
        utcDayStart(new Date('2026-09-19T02:30:00.000Z')),
        '2026-09-19T00:00:00.000Z',
    )
})

test('usageMaybeTruncated: avisa cuando PostgREST pudo haber capado la página', () => {
    // PostgREST devuelve como mucho 1000 filas y las TRUNCA EN SILENCIO,
    // aunque se pida un limit mayor.
    assert.equal(usageMaybeTruncated(999), false)
    assert.equal(usageMaybeTruncated(1000), true)
    assert.equal(usageMaybeTruncated(USAGE_ROWS_LIMIT), true)
})
