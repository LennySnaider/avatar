// src/services/kie/seedance25Scene.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { seedance25Scene } from './seedance25Scene.ts'

/**
 * El 422 que esto impide repetir (2026-09-19):
 *   "The reference video and the first and last frames are mutually
 *    exclusive, and only one scene can be selected"
 * Se mandaba `first_frame_url` y `reference_video_urls` en la MISMA petición
 * porque el código trataba vídeo y audio como canales independientes del modo
 * de imagen. La doc de KIE dice que son escenas excluyentes.
 */

const scene = (o: Partial<Parameters<typeof seedance25Scene>[0]>) =>
    seedance25Scene({
        hasFirstFrame: false,
        imageRefCount: 0,
        videoRefCount: 0,
        audioRefCount: 0,
        ...o,
    })

test('EL CASO DEL 422: primer fotograma + vídeo de referencia → escena de referencias', () => {
    assert.equal(scene({ hasFirstFrame: true, videoRefCount: 1 }), 'references')
})

test('primer fotograma + audio de referencia → escena de referencias', () => {
    assert.equal(scene({ hasFirstFrame: true, audioRefCount: 1 }), 'references')
})

test('primer fotograma SOLO → escena de primer fotograma', () => {
    assert.equal(scene({ hasFirstFrame: true }), 'first-frame')
})

test('primer fotograma + refs de identidad → referencias (comportamiento ya existente)', () => {
    assert.equal(scene({ hasFirstFrame: true, imageRefCount: 2 }), 'references')
})

test('solo refs, sin fotograma → referencias', () => {
    assert.equal(scene({ videoRefCount: 1 }), 'references')
    assert.equal(scene({ imageRefCount: 3 }), 'references')
})

test('text-to-video puro (nada de nada) → referencias, que no añade ningún canal', () => {
    assert.equal(scene({}), 'references')
})

test('los tres canales de referencia juntos son UNA escena, no tres', () => {
    assert.equal(
        scene({ imageRefCount: 2, videoRefCount: 1, audioRefCount: 1 }),
        'references',
    )
})
