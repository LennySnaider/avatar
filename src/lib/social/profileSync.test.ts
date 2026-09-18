import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planProfileSync } from './profileSync.ts'

const row = (id: string, username: string, status = 'active') => ({ id, upload_post_username: username, status })
const up = (username: string) => ({ username })

test('planProfileSync: username en ambos lados → activate con los detalles upstream', () => {
    const plan = planProfileSync([row('r1', 'emily-9121b8a5')], [up('emily-9121b8a5')])
    assert.deepEqual(plan.activate, [{ id: 'r1', details: { username: 'emily-9121b8a5' } }])
    assert.deepEqual(plan.insert, [])
    assert.deepEqual(plan.disconnect, [])
})

test('planProfileSync: perfil upstream que la org no tiene → insert (perfil libre)', () => {
    const plan = planProfileSync([], [up('SalesBot'), up('lennys-pizza-pilot')])
    assert.deepEqual(plan.insert.map((p) => p.username), ['SalesBot', 'lennys-pizza-pilot'])
    assert.deepEqual(plan.activate, [])
})

test('planProfileSync: fila active que ya no está upstream → disconnect', () => {
    const plan = planProfileSync([row('r1', 'borrado-en-el-panel')], [])
    assert.deepEqual(plan.disconnect, ['r1'])
})

test('planProfileSync: una fila ya disconnected (legacy) no se toca aunque no esté upstream', () => {
    const plan = planProfileSync([row('legacy', 'prime-avatar', 'disconnected')], [up('SalesBot')])
    assert.deepEqual(plan.disconnect, [])
    assert.deepEqual(plan.activate, [])
    assert.deepEqual(plan.insert, [{ username: 'SalesBot' }])
})

test('planProfileSync: una fila disconnected que vuelve a aparecer upstream se reactiva', () => {
    const plan = planProfileSync([row('legacy', 'emily-9121b8a5', 'disconnected')], [up('emily-9121b8a5')])
    assert.deepEqual(plan.activate, [{ id: 'legacy', details: { username: 'emily-9121b8a5' } }])
})
