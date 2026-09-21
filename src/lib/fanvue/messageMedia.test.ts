import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fanvueMediaUuids, toInboxMedia } from './messageMedia.ts'
import type { FanvueResolvedMedia } from './types.ts'

test('fanvueMediaUuids: saca los uuids de Fanvue en orden', () => {
    assert.deepEqual(fanvueMediaUuids([{ uuid: 'a' }, { uuid: 'b' }]), [
        'a',
        'b',
    ])
})

test('fanvueMediaUuids: ignora las ofertas de Telegram (llevan type)', () => {
    const media = [
        { type: 'paid_media', stars: 99, itemId: 'x', saleId: 'y' },
        { uuid: 'a' },
    ]
    assert.deepEqual(fanvueMediaUuids(media), ['a'])
})

test('fanvueMediaUuids: el PPV de sendPpvOffer guarda mediaUuid con type image/video', () => {
    const media = [{ type: 'video', mediaUuid: 'ppv-1', price: 500 }]
    assert.deepEqual(fanvueMediaUuids(media), ['ppv-1'])
})

test('fanvueMediaUuids: lo malformado se descarta sin tirar', () => {
    assert.deepEqual(fanvueMediaUuids(null), [])
    assert.deepEqual(fanvueMediaUuids('[]'), [])
    assert.deepEqual(fanvueMediaUuids([null, 3, { uuid: '' }, { uuid: 7 }]), [])
})

const media = (
    uuid: string,
    variants: FanvueResolvedMedia['variants'],
): FanvueResolvedMedia => ({
    uuid,
    messageUuid: 'm1',
    mediaType: 'image',
    variants,
    purchasedAt: null,
})

const v = (
    variantType: FanvueResolvedMedia['variants'][number]['variantType'],
    url: string,
) => ({
    variantType,
    displayPosition: 0,
    url,
    width: null,
    height: null,
    lengthMs: null,
})

test('toInboxMedia: miniatura para la burbuja y principal para abrir', () => {
    const out = toInboxMedia(['a'], {
        a: media('a', [
            v('main', 'https://main'),
            v('thumbnail', 'https://thumb'),
        ]),
    })
    assert.deepEqual(out, [
        {
            uuid: 'a',
            mediaType: 'image',
            thumbUrl: 'https://thumb',
            fullUrl: 'https://main',
        },
    ])
})

test('toInboxMedia: sin miniatura usa la principal, y al revés', () => {
    const soloMain = toInboxMedia(['a'], {
        a: media('a', [v('main', 'https://main')]),
    })
    assert.equal(soloMain[0].thumbUrl, 'https://main')
    const soloThumb = toInboxMedia(['a'], {
        a: media('a', [v('thumbnail', 'https://thumb')]),
    })
    assert.equal(soloThumb[0].fullUrl, 'https://thumb')
})

test('toInboxMedia: contenido de pago sin comprar sólo trae blurred y se enseña esa', () => {
    const out = toInboxMedia(['a'], {
        a: media('a', [v('blurred', 'https://blur')]),
    })
    assert.equal(out[0].thumbUrl, 'https://blur')
    assert.equal(out[0].fullUrl, 'https://blur')
})

test('toInboxMedia: conserva el orden guardado y salta los null', () => {
    const out = toInboxMedia(['b', 'x', 'a'], {
        a: media('a', [v('main', 'https://a')]),
        b: media('b', [v('main', 'https://b')]),
        x: null,
    })
    assert.deepEqual(
        out.map((m) => m.uuid),
        ['b', 'a'],
    )
})
