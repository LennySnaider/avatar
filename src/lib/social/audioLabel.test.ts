// src/lib/social/audioLabel.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { audioLabelFromMetadata } from './audioLabel.ts'

/**
 * `generations.metadata` es jsonb: llegan filas viejas sin `audio`, y filas
 * escritas por otros flujos con cualquier forma. La distinción que importa es
 * `undefined` vs `''`: undefined significa "no mandes el campo audio_name",
 * mientras que una cadena vacía lo mandaría vacío y pisaría la etiqueta.
 */

test('canción y artista se unen con el separador de Instagram', () => {
    const label = audioLabelFromMetadata({ audio: { name: 'Blinding Lights', author: 'The Weeknd' } })
    assert.equal(label, 'Blinding Lights · The Weeknd')
})

test('sin artista, la etiqueta es sólo la canción', () => {
    assert.equal(audioLabelFromMetadata({ audio: { name: 'Blinding Lights' } }), 'Blinding Lights')
})

test('una generación sin pista no lleva etiqueta', () => {
    assert.equal(audioLabelFromMetadata({ prompt: 'algo' }), undefined)
})

test('metadata nula o de otro tipo no revienta: devuelve undefined', () => {
    // Las filas viejas de `generations` tienen metadata null.
    assert.equal(audioLabelFromMetadata(null), undefined)
    assert.equal(audioLabelFromMetadata(undefined), undefined)
    assert.equal(audioLabelFromMetadata('no soy un objeto'), undefined)
})

test('un nombre en blanco NO produce etiqueta vacía', () => {
    // Mandar audio_name='' pisaría la etiqueta con nada; hay que no mandarlo.
    assert.equal(audioLabelFromMetadata({ audio: { name: '   ' } }), undefined)
})

test('un artista en blanco no deja el separador colgando', () => {
    assert.equal(audioLabelFromMetadata({ audio: { name: 'Canción', author: '  ' } }), 'Canción')
})

test('audio presente pero sin nombre no produce etiqueta', () => {
    assert.equal(audioLabelFromMetadata({ audio: { trackId: '7abc', source: 'tiktok-cml' } }), undefined)
})
