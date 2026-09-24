import { test } from 'node:test'
import assert from 'node:assert/strict'
import { concatInt16, downsampleBuffer, encodeWav, floatTo16BitPCM, rms } from './wav.ts'

test('floatTo16BitPCM satura y escala', () => {
    const out = floatTo16BitPCM(new Float32Array([0, 1, -1, 2, -2, 0.5]))
    assert.deepEqual(Array.from(out), [0, 32767, -32768, 32767, -32768, 16383])
})

test('downsampleBuffer reduce la longitud en la proporción de tasas', () => {
    const input = new Float32Array(48000).fill(0.25)
    const out = downsampleBuffer(input, 48000, 16000)
    assert.equal(out.length, 16000)
    assert.ok(Math.abs(out[100] - 0.25) < 1e-6)
    // a la misma tasa no toca nada
    assert.equal(downsampleBuffer(input, 16000, 16000), input)
})

test('encodeWav escribe una cabecera RIFF correcta para PCM16 mono', () => {
    const pcm = new Int16Array([1, -1, 1000])
    const wav = encodeWav(pcm, 16000)
    const view = new DataView(wav.buffer)
    const tag = (o: number) => String.fromCharCode(wav[o], wav[o + 1], wav[o + 2], wav[o + 3])
    assert.equal(wav.length, 44 + 6)
    assert.equal(tag(0), 'RIFF')
    assert.equal(tag(8), 'WAVE')
    assert.equal(tag(12), 'fmt ')
    assert.equal(tag(36), 'data')
    assert.equal(view.getUint32(4, true), 36 + 6)
    assert.equal(view.getUint16(20, true), 1)
    assert.equal(view.getUint16(22, true), 1)
    assert.equal(view.getUint32(24, true), 16000)
    assert.equal(view.getUint32(28, true), 32000)
    assert.equal(view.getUint16(34, true), 16)
    assert.equal(view.getUint32(40, true), 6)
    assert.equal(view.getInt16(44, true), 1)
    assert.equal(view.getInt16(46, true), -1)
    assert.equal(view.getInt16(48, true), 1000)
})

test('concatInt16 une bloques en orden', () => {
    const out = concatInt16([new Int16Array([1, 2]), new Int16Array([]), new Int16Array([3])])
    assert.deepEqual(Array.from(out), [1, 2, 3])
})

test('rms de silencio es 0 y de una señal constante es su amplitud', () => {
    assert.equal(rms(new Float32Array(0)), 0)
    assert.equal(rms(new Float32Array(10).fill(0)), 0)
    assert.ok(Math.abs(rms(new Float32Array(10).fill(0.5)) - 0.5) < 1e-6)
})
