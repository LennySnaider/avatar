import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fanvueMediaUuids, indexChatMedia } from './messageMedia.ts'
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

test('indexChatMedia: miniatura para la burbuja y principal para abrir', () => {
    const out = indexChatMedia([
        media('a', [
            v('main', 'https://main'),
            v('thumbnail', 'https://thumb'),
        ]),
    ])
    assert.deepEqual(out, {
        a: {
            uuid: 'a',
            mediaType: 'image',
            thumbUrl: 'https://thumb',
            fullUrl: 'https://main',
        },
    })
})

test('indexChatMedia: sin miniatura usa la principal, y al revés', () => {
    const soloMain = indexChatMedia([media('a', [v('main', 'https://main')])])
    assert.equal(soloMain.a.thumbUrl, 'https://main')
    const soloThumb = indexChatMedia([
        media('a', [v('thumbnail', 'https://thumb')]),
    ])
    assert.equal(soloThumb.a.fullUrl, 'https://thumb')
})

test('indexChatMedia: contenido de pago sin comprar sólo trae blurred y se enseña esa', () => {
    const out = indexChatMedia([media('a', [v('blurred', 'https://blur')])])
    assert.equal(out.a.thumbUrl, 'https://blur')
    assert.equal(out.a.fullUrl, 'https://blur')
})

test('indexChatMedia: un medio repetido (envío masivo) se queda con el primero, el más reciente', () => {
    const out = indexChatMedia([
        media('a', [v('main', 'https://nuevo')]),
        media('a', [v('main', 'https://viejo')]),
    ])
    assert.equal(out.a.fullUrl, 'https://nuevo')
})

test('indexChatMedia: sin variantes el medio queda sin URLs, sin tirar', () => {
    const out = indexChatMedia([media('a', [])])
    assert.equal(out.a.thumbUrl, null)
    assert.equal(out.a.fullUrl, null)
})
