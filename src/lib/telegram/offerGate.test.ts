import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    filterFreeCandidates,
    filterOfferCandidates,
    findFreeMediaOffer,
    hasFreeMediaOffer,
    hasPaidMediaOffer,
    isOfferMedia,
    isOfferOnCooldown,
    resolveOfferAction,
    collectFreeMediaItemIds,
} from './offerGate.ts'

const items = [
    { id: 'a', title: 'A', stars: 50 },
    { id: 'b', title: 'B', stars: 500 },
    { id: 'c', title: 'C', stars: 99 },
]

test('sin tope ni compras, todos son candidatos', () => {
    assert.deepEqual(
        filterOfferCandidates(items, {
            maxOfferStars: undefined,
            purchasedItemIds: [],
        }).map((i) => i.id),
        ['a', 'b', 'c'],
    )
})

test('el tope de Stars descarta lo caro', () => {
    assert.deepEqual(
        filterOfferCandidates(items, {
            maxOfferStars: 100,
            purchasedItemIds: [],
        }).map((i) => i.id),
        ['a', 'c'],
    )
})

test('lo ya comprado por este fan no se vuelve a ofrecer', () => {
    assert.deepEqual(
        filterOfferCandidates(items, {
            maxOfferStars: undefined,
            purchasedItemIds: ['a'],
        }).map((i) => i.id),
        ['b', 'c'],
    )
})

test('sin oferta previa no hay enfriamiento', () => {
    assert.equal(
        isOfferOnCooldown(null, Date.parse('2026-09-14T12:00:00Z'), 6),
        false,
    )
})

test('dentro de la ventana, enfriando', () => {
    assert.equal(
        isOfferOnCooldown(
            '2026-09-14T08:00:00Z',
            Date.parse('2026-09-14T12:00:00Z'),
            6,
        ),
        true,
    )
})

test('pasada la ventana, libre', () => {
    assert.equal(
        isOfferOnCooldown(
            '2026-09-14T05:00:00Z',
            Date.parse('2026-09-14T12:00:00Z'),
            6,
        ),
        false,
    )
})

test('detecta una oferta dentro de media aunque venga con otras cosas', () => {
    assert.equal(
        hasPaidMediaOffer([
            { type: 'image' },
            { type: 'paid_media_offer', itemId: 'x', stars: 1, caption: '' },
        ]),
        true,
    )
    assert.equal(hasPaidMediaOffer([{ type: 'image' }]), false)
    assert.equal(hasPaidMediaOffer(null), false)
    assert.equal(hasPaidMediaOffer('garbage'), false)
})

test('el tope es inclusivo: un item que cuesta exactamente el tope se ofrece', () => {
    assert.deepEqual(
        filterOfferCandidates(items, {
            maxOfferStars: 99,
            purchasedItemIds: [],
        }).map((i) => i.id),
        ['a', 'c'],
    )
})

test('tope 0 = no ofrecer nada', () => {
    assert.deepEqual(
        filterOfferCandidates(items, {
            maxOfferStars: 0,
            purchasedItemIds: [],
        }),
        [],
    )
})

test('enfriamiento 0 = sin enfriamiento, aunque la oferta fuera hace un segundo', () => {
    assert.equal(
        isOfferOnCooldown(
            '2026-09-14T11:59:59Z',
            Date.parse('2026-09-14T12:00:00Z'),
            0,
        ),
        false,
    )
})

test('detecta un teaser gratis dentro de media aunque venga con otras cosas', () => {
    assert.deepEqual(
        findFreeMediaOffer([
            { type: 'image' },
            { type: 'free_media_offer', itemId: 'x', caption: 'hola' },
        ]),
        { type: 'free_media_offer', itemId: 'x', caption: 'hola' },
    )
    assert.equal(findFreeMediaOffer([{ type: 'image' }]), null)
    assert.equal(findFreeMediaOffer(null), null)
    assert.equal(findFreeMediaOffer('garbage'), null)
})

test('hasFreeMediaOffer refleja findFreeMediaOffer', () => {
    assert.equal(
        hasFreeMediaOffer([
            { type: 'free_media_offer', itemId: 'x', caption: '' },
        ]),
        true,
    )
    assert.equal(hasFreeMediaOffer([{ type: 'image' }]), false)
})

test('un media con free_media_offer NO cuenta como oferta pagada (el autopilot depende de esto)', () => {
    assert.equal(
        hasPaidMediaOffer([
            { type: 'free_media_offer', itemId: 'x', caption: '' },
        ]),
        false,
    )
})

test('un media con paid_media_offer NO cuenta como teaser gratis', () => {
    assert.equal(
        hasFreeMediaOffer([
            { type: 'paid_media_offer', itemId: 'x', stars: 1, caption: '' },
        ]),
        false,
    )
})

test('filterFreeCandidates descarta lo ya enviado a este fan', () => {
    const freeItems = [
        { id: 'f1', title: 'Free 1' },
        { id: 'f2', title: 'Free 2' },
        { id: 'f3', title: 'Free 3' },
    ]
    assert.deepEqual(
        filterFreeCandidates(freeItems, ['f2']).map((i) => i.id),
        ['f1', 'f3'],
    )
})

test('filterFreeCandidates sin nada enviado devuelve el catálogo entero', () => {
    const freeItems = [{ id: 'f1', title: 'Free 1' }]
    assert.deepEqual(filterFreeCandidates(freeItems, []), freeItems)
})

test('filterFreeCandidates con todo ya enviado no deja candidatos', () => {
    const freeItems = [
        { id: 'f1', title: 'Free 1' },
        { id: 'f2', title: 'Free 2' },
    ]
    assert.deepEqual(filterFreeCandidates(freeItems, ['f1', 'f2']), [])
})

test('isOfferMedia reconoce los cuatro tipos de oferta', () => {
    assert.equal(
        isOfferMedia([
            { type: 'paid_media_offer', itemId: 'x', stars: 1, caption: '' },
        ]),
        true,
    )
    assert.equal(
        isOfferMedia([
            { type: 'paid_media', itemId: 'x', stars: 1, saleId: 's1' },
        ]),
        true,
    )
    assert.equal(
        isOfferMedia([{ type: 'free_media_offer', itemId: 'x', caption: '' }]),
        true,
    )
    assert.equal(isOfferMedia([{ type: 'free_media', itemId: 'x' }]), true)
})

test('isOfferMedia es false para media sin ninguna oferta', () => {
    assert.equal(isOfferMedia([{ type: 'image' }]), false)
    assert.equal(isOfferMedia(null), false)
    assert.equal(isOfferMedia('garbage'), false)
    assert.equal(isOfferMedia([]), false)
})

test('resolveOfferAction: action none no elige nada', () => {
    assert.equal(resolveOfferAction({ action: 'none', index: 0 }, 2, 2), null)
})

test('resolveOfferAction: free válido devuelve kind free', () => {
    assert.deepEqual(resolveOfferAction({ action: 'free', index: 1 }, 2, 3), {
        kind: 'free',
        index: 1,
    })
})

test('resolveOfferAction: paid válido devuelve kind paid', () => {
    assert.deepEqual(resolveOfferAction({ action: 'paid', index: 0 }, 0, 3), {
        kind: 'paid',
        index: 0,
    })
})

test('resolveOfferAction: free con lista gratis vacía no es elegible', () => {
    assert.equal(resolveOfferAction({ action: 'free', index: 0 }, 0, 3), null)
})

test('resolveOfferAction: paid con lista de pago vacía no es elegible', () => {
    assert.equal(resolveOfferAction({ action: 'paid', index: 0 }, 2, 0), null)
})

test('resolveOfferAction: índice fuera de rango (alto, negativo) no vale', () => {
    assert.equal(resolveOfferAction({ action: 'free', index: 2 }, 2, 0), null)
    assert.equal(resolveOfferAction({ action: 'free', index: -1 }, 2, 0), null)
})

test('resolveOfferAction: índice no entero no vale', () => {
    assert.equal(resolveOfferAction({ action: 'paid', index: 1.5 }, 0, 3), null)
    assert.equal(resolveOfferAction({ action: 'paid', index: NaN }, 0, 3), null)
    assert.equal(
        resolveOfferAction({ action: 'paid', index: undefined }, 0, 3),
        null,
    )
})

test('resolveOfferAction: un action desconocido se trata como none', () => {
    assert.equal(resolveOfferAction({ action: 'PAID', index: 0 }, 2, 2), null)
    assert.equal(resolveOfferAction({ action: undefined, index: 0 }, 2, 2), null)
    assert.equal(resolveOfferAction({}, 2, 2), null)
})

test('resolveOfferAction: el índice cuenta contra SU lista, no contra la otra', () => {
    // 1 gratis y 5 de pago: el índice 3 es válido de pago e inválido gratis.
    assert.equal(resolveOfferAction({ action: 'free', index: 3 }, 1, 5), null)
    assert.deepEqual(resolveOfferAction({ action: 'paid', index: 3 }, 1, 5), {
        kind: 'paid',
        index: 3,
    })
})

test('collectFreeMediaItemIds recoge enviados y ofrecidos, sin repetir', () => {
    assert.deepEqual(
        collectFreeMediaItemIds([
            [{ type: 'free_media', itemId: 'f1' }],
            [{ type: 'image' }, { type: 'free_media_offer', itemId: 'f2' }],
            [{ type: 'free_media', itemId: 'f1' }],
            [{ type: 'paid_media', itemId: 'p1' }],
            [{ type: 'paid_media_offer', itemId: 'p2' }],
        ]),
        ['f1', 'f2'],
    )
})

test('collectFreeMediaItemIds aguanta media basura', () => {
    assert.deepEqual(
        collectFreeMediaItemIds([
            null,
            'garbage',
            [],
            [{ type: 'free_media' }],
            [{ type: 'free_media', itemId: 42 }],
        ]),
        [],
    )
})

test('resolveOfferAction: un index que no es número no se coacciona a 0', () => {
    // `Number(null)` y `Number('')` valen 0, que es un índice VÁLIDO: sin la
    // comprobación de tipo, un modelo que respondiera `"index": null` acabaría
    // ofreciendo el primer ítem de la lista sin haberlo elegido.
    assert.equal(resolveOfferAction({ action: 'free', index: null }, 2, 2), null)
    assert.equal(resolveOfferAction({ action: 'free', index: '' }, 2, 2), null)
    assert.equal(resolveOfferAction({ action: 'paid', index: false }, 2, 2), null)
    assert.equal(resolveOfferAction({ action: 'paid', index: [] }, 2, 2), null)
})

test('resolveOfferAction: un index en texto ("1") tampoco vale', () => {
    assert.equal(resolveOfferAction({ action: 'paid', index: '1' }, 0, 3), null)
})
