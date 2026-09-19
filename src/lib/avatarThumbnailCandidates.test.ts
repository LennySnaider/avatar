// src/lib/avatarThumbnailCandidates.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    pickThumbnailRefs,
    buildThumbnailCandidates,
} from './avatarThumbnailCandidates.ts'

/**
 * El bug que esto impide repetir (reporte 2026-09-19): el selector de avatares
 * pintaba la HOJA DE ÁNGULOS en vez de la cara frontal. La lista de candidatos
 * mezclaba tipos (`[...caras, ...ángulos, ...generales]`) y el <img> avanza al
 * siguiente en `onError`, así que un fallo de la cara —404 o caché envenenada
 * sin CORS— degradaba en silencio a otra referencia distinta.
 */
const ref = (
    type: string,
    created_at: string,
    storage_path = `${type}/${created_at}.jpg`,
) => ({ type, created_at, storage_path, storage_provider: 'r2' })

const url = (p: string) => `https://cdn/${p}`

test('EL CASO DEL REPORTE: con cara, los candidatos son SOLO caras', () => {
    const refs = [
        ref('angle', '2026-07-28T01:44:02Z'),
        ref('face', '2026-07-28T01:44:01Z'),
        ref('general', '2026-07-01T00:00:00Z'),
    ]
    const got = pickThumbnailRefs(refs)
    assert.equal(got.length, 1)
    assert.equal(got[0].type, 'face')
    assert.ok(!got.some((r) => r.type === 'angle'))
})

test('varias caras: la más nueva primero, y el avance se conserva entre ellas', () => {
    const refs = [
        ref('face', '2026-07-01T00:00:00Z', 'face/vieja.jpg'),
        ref('face', '2026-08-03T00:00:00Z', 'face/nueva.jpg'),
        ref('angle', '2026-09-01T00:00:00Z'),
    ]
    const got = pickThumbnailRefs(refs)
    assert.deepEqual(
        got.map((r) => r.storage_path),
        ['face/nueva.jpg', 'face/vieja.jpg'],
    )
})

test('sin cara se usa el ángulo; sin ángulo, el general', () => {
    assert.equal(
        pickThumbnailRefs([ref('angle', '2026-01-01T00:00:00Z')])[0].type,
        'angle',
    )
    assert.equal(
        pickThumbnailRefs([ref('general', '2026-01-01T00:00:00Z')])[0].type,
        'general',
    )
})

test('una fila sin bytes registrados (storage_path nulo) no es candidata', () => {
    const refs = [
        {
            type: 'face',
            created_at: '2026-08-01T00:00:00Z',
            storage_path: null,
        },
        ref('angle', '2026-07-01T00:00:00Z'),
    ]
    // La cara no cuenta, así que el grupo de caras está VACÍO y se pasa al
    // siguiente tipo — no se devuelve una cara inservible.
    assert.equal(pickThumbnailRefs(refs)[0].type, 'angle')
})

test('sin referencias, sin candidatos (la UI pinta el hueco)', () => {
    assert.deepEqual(pickThumbnailRefs([]), [])
    assert.deepEqual(pickThumbnailRefs(null), [])
    assert.deepEqual(pickThumbnailRefs(undefined), [])
})

test('buildThumbnailCandidates resuelve las URLs en el mismo orden', () => {
    const refs = [
        ref('angle', '2026-09-01T00:00:00Z'),
        ref('face', '2026-08-03T00:00:00Z', 'face/nueva.jpg'),
        ref('face', '2026-07-01T00:00:00Z', 'face/vieja.jpg'),
    ]
    assert.deepEqual(buildThumbnailCandidates(refs, url), [
        'https://cdn/face/nueva.jpg',
        'https://cdn/face/vieja.jpg',
    ])
})
