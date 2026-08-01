// src/utils/captionScene.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sceneFromGenerationPrompt } from './captionScene.ts'

test('prompt de escena limpio pasa intacto', () => {
    const p =
        'Sitting on the edge of the bed with her bare back to the camera, sheet pooled at her hips. Soft dawn light, warm film tones.'
    assert.equal(sceneFromGenerationPrompt(p), p)
})

test('[CLONE: ...] conserva su CONTENIDO (ahí vive el outfit y el setting)', () => {
    const out = sceneFromGenerationPrompt(
        '[CLONE: A woman in a dark gray athletic bra top and matching leggings, standing in a modern gym]',
    )
    assert.match(out, /dark gray athletic bra top/)
    assert.match(out, /modern gym/)
    assert.doesNotMatch(out, /\[|\]/)
})

test('[BODY:] y [FACE:] se TIRAN enteros (son harness de identidad, no escena)', () => {
    const out = sceneFromGenerationPrompt(
        '[BODY: hourglass, bust 95cm, waist 60cm] [FACE: match face EXACTLY] at the gym, fitted crop top, shallow depth of field',
    )
    assert.doesNotMatch(out, /hourglass|95cm|match face/i)
    assert.match(out, /at the gym, fitted crop top/)
})

test('mezcla real: BODY + FACE + CLONE + cola de escena', () => {
    const out = sceneFromGenerationPrompt(
        '[BODY: curvy build, waist 62cm] [FACE: identity lock] [CLONE: black ribbed high-neck crop top and a delicate gold hip chain] on a rooftop at golden hour',
    )
    assert.doesNotMatch(out, /curvy build|62cm|identity lock/i)
    assert.match(out, /black ribbed high-neck crop top/)
    assert.match(out, /rooftop at golden hour/)
})

test('quita la cláusula anti-watermark y la cola "Her anatomy:"', () => {
    const out = sceneFromGenerationPrompt(
        'On a tropical beach at sunset. Do NOT add any watermark or logo to the image. Her anatomy: bust 95cm, hips 100cm, glutes level 4',
    )
    assert.equal(out, 'On a tropical beach at sunset.')
})

test('quita el prefijo "Edit (modelo · proveedor):" que no es escena', () => {
    const out = sceneFromGenerationPrompt(
        'Edit (Seedream 5.0 Pro · KIE): sitting by the window in soft morning light',
    )
    assert.equal(out, 'sitting by the window in soft morning light')
})

test('sin escena utilizable devuelve cadena vacía (el caller NO debe inventar)', () => {
    assert.equal(
        sceneFromGenerationPrompt('[BODY: hourglass] [FACE: lock]'),
        '',
    )
    assert.equal(sceneFromGenerationPrompt('   '), '')
    assert.equal(sceneFromGenerationPrompt(undefined), '')
    // Demasiado corto para describir una foto: no sirve de base para un caption
    assert.equal(sceneFromGenerationPrompt('fix finger'), '')
})

test('colapsa espacios y no deja puntuación huérfana', () => {
    const out = sceneFromGenerationPrompt(
        '[BODY: x]   ,  on a sunlit terrace   ,   linen dress  ',
    )
    assert.equal(out, 'on a sunlit terrace , linen dress')
})
