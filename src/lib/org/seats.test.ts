// src/lib/org/seats.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    computeSeatUsage,
    canInviteMore,
    formatSeatUsage,
    type SeatUsageInput,
} from './seats.ts'

const plan = (over: Partial<SeatUsageInput> = {}): SeatUsageInput => ({
    members: 1,
    pendingInvitations: 0,
    maxSeats: 5,
    planSlug: 'demo',
    planFound: true,
    ...over,
})

test('miembros + invitaciones vivas ocupan asiento', () => {
    const u = computeSeatUsage(
        plan({ members: 2, pendingInvitations: 1, maxSeats: 3 }),
    )
    assert.equal(u.used, 3)
    assert.equal(u.remaining, 0)
    assert.equal(u.isFull, true)
})

test('con hueco: remaining y no lleno', () => {
    const u = computeSeatUsage(
        plan({ members: 2, pendingInvitations: 0, maxSeats: 3 }),
    )
    assert.equal(u.remaining, 1)
    assert.equal(u.isFull, false)
    assert.deepEqual(canInviteMore(u), { ok: true })
})

test('el plan demo: 1 de 5 al principio, lleno con el owner + 4', () => {
    assert.equal(formatSeatUsage(computeSeatUsage(plan())), '1 de 5 asientos')
    const lleno = computeSeatUsage(plan({ members: 3, pendingInvitations: 2 }))
    assert.equal(lleno.isFull, true)
    assert.equal(formatSeatUsage(lleno), '5 de 5 asientos')
})

test('un plan sin tope (agency): ilimitado, nunca lleno', () => {
    const u = computeSeatUsage(
        plan({ members: 50, maxSeats: null, planSlug: 'agency' }),
    )
    assert.equal(u.unlimited, true)
    assert.equal(u.max, null)
    assert.equal(u.remaining, null)
    assert.equal(u.isFull, false)
    assert.equal(u.planUnknown, false)
    assert.equal(formatSeatUsage(u), '50 asientos (plan sin límite)')
})

test('SIN PLAN (plan_slug NULL): sin limite, pero se avisa — la regla que impide bloquear a todas las orgs de hoy', () => {
    const u = computeSeatUsage(
        plan({ members: 7, planSlug: null, maxSeats: null, planFound: false }),
    )
    assert.equal(u.planUnknown, true)
    assert.equal(u.unlimited, true)
    assert.equal(u.isFull, false)
    assert.deepEqual(canInviteMore(u), { ok: true })
    assert.equal(formatSeatUsage(u), '7 asientos (sin plan asignado)')
})

test('plan_slug que ya no esta en el catalogo: igual que sin plan', () => {
    const u = computeSeatUsage(
        plan({ planSlug: 'fantasma', planFound: false, maxSeats: null }),
    )
    assert.equal(u.planUnknown, true)
    assert.equal(u.isFull, false)
})

test('used > max tras un cambio de plan a la baja: sigue lleno y remaining no es negativo', () => {
    const u = computeSeatUsage(
        plan({ members: 8, pendingInvitations: 1, maxSeats: 5 }),
    )
    assert.equal(u.isFull, true)
    assert.equal(u.remaining, 0)
})

test('el rechazo lleva el numero del plan y el desglose', () => {
    const u = computeSeatUsage(
        plan({ members: 4, pendingInvitations: 1, maxSeats: 5 }),
    )
    const r = canInviteMore(u)
    assert.equal(r.ok, false)
    if (!r.ok) {
        assert.match(r.reason, /5 asientos/)
        assert.match(r.reason, /4 miembros/)
        assert.match(r.reason, /1 invitación pendiente/)
        assert.match(r.reason, /Amplía tu paquete/)
    }
})

test('singular y plural en el formato', () => {
    assert.equal(
        formatSeatUsage(
            computeSeatUsage(
                plan({ members: 1, planSlug: null, planFound: false }),
            ),
        ),
        '1 asiento (sin plan asignado)',
    )
})

test('numeros negativos se tratan como cero, no como asientos de regalo', () => {
    const u = computeSeatUsage(plan({ members: -3, pendingInvitations: -1 }))
    assert.equal(u.used, 0)
})
