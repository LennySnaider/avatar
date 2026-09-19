// src/lib/agent/attentionWatch.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diffAttention } from './attentionWatch.ts'

/**
 * Reporte 2026-09-19: el autopilot escaló un hilo de Telegram ("Paid media
 * offer needs approval") y el creador no se enteró — el fan se quedó sin
 * respuesta. Esta regla decide por qué hilos hay que avisar en cada sondeo.
 */
const item = (id: string) => ({ id })

test('la primera mirada no avisa uno por uno: devuelve el backlog y nada fresco', () => {
    const d = diffAttention(null, [item('a'), item('b')])
    assert.deepEqual(d.fresh, [])
    assert.deepEqual(d.backlog, [item('a'), item('b')])
    assert.deepEqual([...d.nextSeen], ['a', 'b'])
})

test('un hilo que aparece después de la primera mirada es fresco', () => {
    const d = diffAttention(new Set(['a']), [item('a'), item('b')])
    assert.deepEqual(d.fresh, [item('b')])
    assert.deepEqual(d.backlog, [])
})

test('sin cambios no hay nada fresco', () => {
    const d = diffAttention(new Set(['a', 'b']), [item('a'), item('b')])
    assert.deepEqual(d.fresh, [])
})

test('el conjunto recordado se sustituye: un hilo atendido y re-escalado vuelve a avisar', () => {
    const afterAttended = diffAttention(new Set(['a']), [])
    assert.deepEqual([...afterAttended.nextSeen], [])
    const again = diffAttention(afterAttended.nextSeen, [item('a')])
    assert.deepEqual(again.fresh, [item('a')])
})

test('primera mirada sin backlog: nada que avisar', () => {
    const d = diffAttention(null, [])
    assert.deepEqual(d.fresh, [])
    assert.deepEqual(d.backlog, [])
    assert.equal(d.nextSeen.size, 0)
})
