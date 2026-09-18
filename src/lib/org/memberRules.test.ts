// src/lib/org/memberRules.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    canManageMembers,
    countOwners,
    decideRoleChange,
    decideRemoval,
    INVITABLE_ROLES,
    type MemberSummary,
} from './memberRules.ts'

const m = (userId: string, role: MemberSummary['role']): MemberSummary => ({
    userId,
    role,
})

const A = m('a', 'owner')
const B = m('b', 'admin')
const C = m('c', 'operator')

test('solo el propietario gestiona miembros (la bifurcacion documentada)', () => {
    assert.equal(canManageMembers('owner'), true)
    assert.equal(canManageMembers('admin'), false)
    assert.equal(canManageMembers('operator'), false)
    assert.equal(canManageMembers(null), false)
})

test('no se invita a nadie como propietario', () => {
    assert.deepEqual([...INVITABLE_ROLES], ['operator', 'admin'])
})

test('countOwners', () => {
    assert.equal(countOwners([A, B, C]), 1)
    assert.equal(countOwners([A, m('d', 'owner')]), 2)
    assert.equal(countOwners([]), 0)
})

// ── Cambiar rol ──────────────────────────────────────────────────────────
test('camino feliz: el owner sube a un operator a admin', () => {
    assert.deepEqual(decideRoleChange([A, B, C], 'a', 'c', 'admin'), {
        ok: true,
    })
})

test('degradar al UNICO owner se rechaza', () => {
    const r = decideRoleChange([A, B, C], 'a', 'a', 'admin')
    assert.equal(r.ok, false)
    if (!r.ok) assert.match(r.reason, /sin propietario/)
})

test('degradarte a ti mismo siendo el unico owner se rechaza POR LA MISMA REGLA', () => {
    const solo = decideRoleChange([A, C], 'a', 'a', 'operator')
    const otro = decideRoleChange([A, C], 'a', 'a', 'operator')
    assert.equal(solo.ok, false)
    assert.deepEqual(solo, otro)
})

test('con dos owners, degradar a uno esta permitido', () => {
    const D = m('d', 'owner')
    assert.deepEqual(decideRoleChange([A, D, C], 'a', 'd', 'admin'), {
        ok: true,
    })
    assert.deepEqual(decideRoleChange([A, D, C], 'a', 'a', 'admin'), {
        ok: true,
    })
})

test('transferir la propiedad: subir a otro y luego bajarse', () => {
    const paso1 = decideRoleChange([A, B], 'a', 'b', 'owner')
    assert.deepEqual(paso1, { ok: true })
    const despues = [A, m('b', 'owner')]
    const paso2 = decideRoleChange(despues, 'a', 'a', 'admin')
    assert.deepEqual(paso2, { ok: true })
})

test('un operator o un admin no pueden cambiar roles', () => {
    assert.equal(decideRoleChange([A, B, C], 'c', 'b', 'operator').ok, false)
    assert.equal(decideRoleChange([A, B, C], 'b', 'c', 'admin').ok, false)
})

test('cambiar al rol que ya tiene se rechaza con mensaje propio', () => {
    const r = decideRoleChange([A, B, C], 'a', 'b', 'admin')
    assert.equal(r.ok, false)
    if (!r.ok) assert.match(r.reason, /ya es administrador/)
})

test('objetivo que no esta en la lista, actor que no esta, y rol inexistente', () => {
    assert.equal(decideRoleChange([A, B], 'a', 'zzz', 'admin').ok, false)
    assert.equal(decideRoleChange([A, B], 'zzz', 'b', 'admin').ok, false)
    assert.equal(decideRoleChange([A, B], 'a', 'b', 'viewer').ok, false)
})

// ── Expulsar ─────────────────────────────────────────────────────────────
test('camino feliz: el owner expulsa a un operator', () => {
    assert.deepEqual(decideRemoval([A, B, C], 'a', 'c'), { ok: true })
})

test('expulsar al unico owner se rechaza', () => {
    const r = decideRemoval([A, B, C], 'a', 'a')
    assert.equal(r.ok, false)
})

test('autoexpulsarse se rechaza AUNQUE haya otro owner', () => {
    const D = m('d', 'owner')
    const r = decideRemoval([A, D, C], 'a', 'a')
    assert.equal(r.ok, false)
    if (!r.ok) assert.match(r.reason, /a ti mismo/)
})

test('un operator no puede expulsar a nadie', () => {
    assert.equal(decideRemoval([A, B, C], 'c', 'b').ok, false)
})

test('expulsar a alguien que no esta se rechaza', () => {
    assert.equal(decideRemoval([A, B, C], 'a', 'zzz').ok, false)
})
