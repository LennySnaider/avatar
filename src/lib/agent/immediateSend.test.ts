import { test } from 'node:test'
import assert from 'node:assert/strict'
import { immediateSendWaitMs } from './immediateSend.ts'

// Función arrancó en t=0, presupuesto 60 s, margen 10 s → tope 50 s.
const base = { startedAtMs: 0, maxDurationMs: 60_000 }

test('send_after dentro del presupuesto → espera exacta hasta send_after', () => {
    const wait = immediateSendWaitMs({ ...base, nowMs: 5_000, sendAfter: new Date(20_000).toISOString() })
    assert.equal(wait, 15_000)
})

test('send_after ya pasado → 0 (enviar ya, no esperar)', () => {
    const wait = immediateSendWaitMs({ ...base, nowMs: 30_000, sendAfter: new Date(20_000).toISOString() })
    assert.equal(wait, 0)
})

test('send_after fuera del presupuesto (menos margen) → null: lo deja al cron', () => {
    // tope = 60 s − 10 s de margen = 50 s; 55 s no cabe
    const wait = immediateSendWaitMs({ ...base, nowMs: 5_000, sendAfter: new Date(55_000).toISOString() })
    assert.equal(wait, null)
})

test('justo en el tope cabe; un ms después no', () => {
    assert.equal(immediateSendWaitMs({ ...base, nowMs: 0, sendAfter: new Date(50_000).toISOString() }), 50_000)
    assert.equal(immediateSendWaitMs({ ...base, nowMs: 0, sendAfter: new Date(50_001).toISOString() }), null)
})

test('sin send_after o fecha inválida → null', () => {
    assert.equal(immediateSendWaitMs({ ...base, nowMs: 0, sendAfter: null }), null)
    assert.equal(immediateSendWaitMs({ ...base, nowMs: 0, sendAfter: 'no-es-fecha' }), null)
})

test('el margen es configurable', () => {
    const wait = immediateSendWaitMs({
        ...base,
        nowMs: 0,
        sendAfter: new Date(58_000).toISOString(),
        safetyMarginMs: 1_000,
    })
    assert.equal(wait, 58_000)
})
