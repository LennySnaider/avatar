// src/services/kie/wan30.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildWan30Input } from './wan30.ts'

/**
 * wan/3-0-video (KIE). Los tres quirks de abajo se MIDIERON en vivo el
 * 2026-09-19 contra la API, no salen de la doc:
 *
 *  1. La resolución va en MAYÚSCULAS. Con "720p" la API responde
 *     `{"code":500,"msg":"resolution is not within the range of allowed
 *     options"}` — y ese 500 NO es una caída: en KIE es el código genérico de
 *     validación (un modelo retirado da 422). Wan 2.2 las quiere en minúscula,
 *     así que mezclarlas es fácil y el error no lo dice.
 *
 *  2. `first_frame_url`/`last_frame_url` y CUALQUIER `reference_*_urls` son
 *     excluyentes. Literal de la API: "first_frame_url / last_frame_url and
 *     reference_*_urls are mutually exclusive" (422) — con comodín, más amplio
 *     que la doc, que solo menciona las imágenes. Mismo contrato que Seedance
 *     2.5, así que la decisión la toma `seedance25Scene`.
 *
 *  3. El campo es `first_frame_url`, no el `image_url` de Wan 2.2.
 */

const IMG = 'https://ejemplo.test/avatar.png'
const REF = 'https://ejemplo.test/ref.png'

test('la resolución sale en MAYÚSCULAS (con minúscula la API da 500)', () => {
    for (const [pedida, esperada] of [
        ['480p', '480P'],
        ['720p', '720P'],
        ['1080p', '1080P'],
    ] as const) {
        const input = buildWan30Input({
            prompt: 'x',
            firstFrameUrl: IMG,
            resolution: pedida,
        })
        assert.equal(input.resolution, esperada)
    }
})

test('una resolución desconocida cae a 720P, nunca se manda tal cual', () => {
    const input = buildWan30Input({
        prompt: 'x',
        firstFrameUrl: IMG,
        resolution: '4K',
    })
    assert.equal(input.resolution, '720P')
})

test('usa first_frame_url, NO el image_url de Wan 2.2', () => {
    const input = buildWan30Input({ prompt: 'x', firstFrameUrl: IMG })
    assert.equal(input.first_frame_url, IMG)
    assert.ok(!('image_url' in input), 'image_url no existe en wan 3.0')
})

test('ESCENA EXCLUYENTE: con refs de imagen NO viaja ningún frame', () => {
    const input = buildWan30Input({
        prompt: 'x',
        firstFrameUrl: IMG,
        lastFrameUrl: IMG,
        referenceImageUrls: [REF, REF],
    })
    assert.deepEqual(input.reference_image_urls, [REF, REF])
    assert.ok(!('first_frame_url' in input), 'first_frame_url rompería el 422')
    assert.ok(!('last_frame_url' in input), 'last_frame_url rompería el 422')
})

test('ESCENA EXCLUYENTE: sin refs manda el frame y ningún reference_*', () => {
    const input = buildWan30Input({ prompt: 'x', firstFrameUrl: IMG })
    assert.equal(input.first_frame_url, IMG)
    assert.ok(!('reference_image_urls' in input))
})

test('el audio del modelo va SIEMPRE apagado (la voz viaja por Speak mode)', () => {
    assert.equal(
        buildWan30Input({ prompt: 'x', firstFrameUrl: IMG }).audio,
        false,
    )
})

test('la duración se capa al rango real 2-30 (la API rebota el 31)', () => {
    const dur = (d?: number) =>
        buildWan30Input({ prompt: 'x', firstFrameUrl: IMG, duration: d })
            .duration
    assert.equal(dur(31), 30)
    assert.equal(dur(1), 2)
    assert.equal(dur(15), 15)
    assert.equal(dur(7.9), 7, 'entero: la API pide step 1')
    assert.equal(dur(undefined), 5, 'default de la doc')
})

test('el prompt se capa a los 20.000 chars documentados', () => {
    const input = buildWan30Input({
        prompt: 'a'.repeat(25000),
        firstFrameUrl: IMG,
    })
    assert.equal((input.prompt as string).length, 20000)
})

test('nsfw_checker va en false — es el motor sin censura del catálogo', () => {
    assert.equal(
        buildWan30Input({ prompt: 'x', firstFrameUrl: IMG }).nsfw_checker,
        false,
    )
})
