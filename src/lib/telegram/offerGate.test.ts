import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterOfferCandidates, hasPaidMediaOffer, isOfferOnCooldown } from './offerGate.ts'

const items = [
    { id: 'a', title: 'A', stars: 50 },
    { id: 'b', title: 'B', stars: 500 },
    { id: 'c', title: 'C', stars: 99 },
]

test('sin tope ni compras, todos son candidatos', () => {
    assert.deepEqual(
        filterOfferCandidates(items, { maxOfferStars: undefined, purchasedItemIds: [] }).map((i) => i.id),
        ['a', 'b', 'c'],
    )
})

test('el tope de Stars descarta lo caro', () => {
    assert.deepEqual(
        filterOfferCandidates(items, { maxOfferStars: 100, purchasedItemIds: [] }).map((i) => i.id),
        ['a', 'c'],
    )
})

test('lo ya comprado por este fan no se vuelve a ofrecer', () => {
    assert.deepEqual(
        filterOfferCandidates(items, { maxOfferStars: undefined, purchasedItemIds: ['a'] }).map((i) => i.id),
        ['b', 'c'],
    )
})

test('sin oferta previa no hay enfriamiento', () => {
    assert.equal(isOfferOnCooldown(null, Date.parse('2026-09-14T12:00:00Z'), 6), false)
})

test('dentro de la ventana, enfriando', () => {
    assert.equal(isOfferOnCooldown('2026-09-14T08:00:00Z', Date.parse('2026-09-14T12:00:00Z'), 6), true)
})

test('pasada la ventana, libre', () => {
    assert.equal(isOfferOnCooldown('2026-09-14T05:00:00Z', Date.parse('2026-09-14T12:00:00Z'), 6), false)
})

test('detecta una oferta dentro de media aunque venga con otras cosas', () => {
    assert.equal(
        hasPaidMediaOffer([{ type: 'image' }, { type: 'paid_media_offer', itemId: 'x', stars: 1, caption: '' }]),
        true,
    )
    assert.equal(hasPaidMediaOffer([{ type: 'image' }]), false)
    assert.equal(hasPaidMediaOffer(null), false)
    assert.equal(hasPaidMediaOffer('garbage'), false)
})

test('el tope es inclusivo: un item que cuesta exactamente el tope se ofrece', () => {
    assert.deepEqual(
        filterOfferCandidates(items, { maxOfferStars: 99, purchasedItemIds: [] }).map((i) => i.id),
        ['a', 'c'],
    )
})

test('tope 0 = no ofrecer nada', () => {
    assert.deepEqual(filterOfferCandidates(items, { maxOfferStars: 0, purchasedItemIds: [] }), [])
})

test('enfriamiento 0 = sin enfriamiento, aunque la oferta fuera hace un segundo', () => {
    assert.equal(isOfferOnCooldown('2026-09-14T11:59:59Z', Date.parse('2026-09-14T12:00:00Z'), 0), false)
})
