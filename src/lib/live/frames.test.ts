import { test } from 'node:test'
import assert from 'node:assert/strict'
import { encodeFrame, parseFrames, type LiveFrame } from './frames.ts'

test('encodeFrame produce una línea JSON terminada en salto', () => {
    const line = encodeFrame({ type: 'text', delta: 'hola' })
    assert.equal(line, '{"type":"text","delta":"hola"}\n')
})

test('parseFrames devuelve los marcos completos y guarda la línea a medias', () => {
    const a: LiveFrame = { type: 'sentence', index: 0, text: 'Hola.' }
    const b: LiveFrame = { type: 'audio', index: 0, pcm16: 'AAAA' }
    const buffer = encodeFrame(a) + encodeFrame(b) + '{"type":"audio_end","ind'
    const { frames, rest } = parseFrames(buffer)
    assert.deepEqual(frames, [a, b])
    assert.equal(rest, '{"type":"audio_end","ind')
})

test('la línea a medias se completa en la siguiente llamada', () => {
    const first = parseFrames('{"type":"audio_end","ind')
    assert.deepEqual(first.frames, [])
    const second = parseFrames(first.rest + 'ex":3}\n')
    assert.deepEqual(second.frames, [{ type: 'audio_end', index: 3 }])
    assert.equal(second.rest, '')
})

test('una línea corrupta o vacía se ignora sin tumbar el resto', () => {
    const { frames, rest } = parseFrames('no es json\n\n{"type":"text","delta":"x"}\n{"sin":"type"}\n')
    assert.deepEqual(frames, [{ type: 'text', delta: 'x' }])
    assert.equal(rest, '')
})
