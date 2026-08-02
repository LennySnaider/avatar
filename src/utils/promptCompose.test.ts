// src/utils/promptCompose.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { insertBeforeCameraBlock } from './promptCompose.ts'

const ESCENA =
    'Soft smile, wearing a pastel pink knit cardigan over a white sundress, sitting on a windowsill in a cozy bedroom. 85mm portrait, shallow depth of field.'
const POSE = 'One knee drawn up with both arms wrapped around it'

test('la pose entra ANTES del bloque de cámara, no en la cola', () => {
    const out = insertBeforeCameraBlock(ESCENA, POSE)
    assert.ok(
        out.indexOf(POSE) < out.indexOf('85mm'),
        `la pose quedó detrás de la cámara: ${out}`,
    )
    assert.ok(out.includes('85mm portrait'), 'se perdió el bloque de cámara')
    assert.ok(out.includes('pastel pink knit cardigan'), 'se perdió la escena')
})

test('reconoce distintos marcadores de cámara', () => {
    for (const cam of [
        'Medium full shot at eye level, soft light',
        'Full body shot from a low angle',
        '50mm lens with shallow depth of field',
        'Single continuous take, slow push-in',
        'Extreme close-up, warm key light',
    ]) {
        const out = insertBeforeCameraBlock(`She stands by a window. ${cam}.`, POSE)
        assert.ok(
            out.indexOf(POSE) < out.indexOf(cam.slice(0, 12)),
            `no detectó "${cam.slice(0, 20)}…" → ${out}`,
        )
    }
})

test('sin bloque de cámara, se añade al final', () => {
    const out = insertBeforeCameraBlock('She stands by a window', POSE)
    assert.equal(out, `She stands by a window. ${POSE}.`)
})

test('prompt vacío devuelve solo la adición', () => {
    assert.equal(insertBeforeCameraBlock('', POSE), `${POSE}.`)
    assert.equal(insertBeforeCameraBlock('   ', POSE), `${POSE}.`)
})

test('adición vacía devuelve el prompt intacto', () => {
    assert.equal(insertBeforeCameraBlock(ESCENA, ''), ESCENA)
    assert.equal(insertBeforeCameraBlock(ESCENA, '   '), ESCENA)
})

test('no duplica puntuación ni deja dobles espacios', () => {
    const out = insertBeforeCameraBlock('She stands by a window.', 'Hands on hips.')
    assert.doesNotMatch(out, /\.\./)
    assert.doesNotMatch(out, /\s{2,}/)
})

test('si la cámara abre el texto, la adición va delante igual', () => {
    const out = insertBeforeCameraBlock('85mm portrait, soft light.', POSE)
    assert.ok(out.startsWith(POSE))
})

test('es idempotente en su forma: recomponer no rompe el orden', () => {
    const once = insertBeforeCameraBlock(ESCENA, POSE)
    const twice = insertBeforeCameraBlock(once, 'Chin lifted')
    assert.ok(twice.indexOf('Chin lifted') < twice.indexOf('85mm'))
    assert.ok(twice.indexOf(POSE) < twice.indexOf('85mm'))
})
