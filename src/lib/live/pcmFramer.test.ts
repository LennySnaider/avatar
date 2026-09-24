import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PcmFramer } from './pcmFramer.ts'

const bytes = (n: number, start = 0) => Uint8Array.from({ length: n }, (_, i) => (start + i) % 256)

test('corta en bloques de como mucho maxBytes', () => {
    const f = new PcmFramer(4)
    const out = f.push(bytes(10))
    assert.deepEqual(out.map((c) => c.length), [4, 4, 2])
})

test('un byte suelto pasa al siguiente trozo sin romper la alineación', () => {
    const f = new PcmFramer(100)
    const a = f.push(bytes(5, 0))
    assert.deepEqual(a.map((c) => Array.from(c)), [[0, 1, 2, 3]])
    const b = f.push(bytes(3, 5))
    assert.deepEqual(b.map((c) => Array.from(c)), [[4, 5, 6, 7]])
})

test('flush descarta el byte suelto final', () => {
    const f = new PcmFramer(100)
    f.push(bytes(3))
    f.flush()
    assert.deepEqual(f.push(bytes(2, 9)).map((c) => Array.from(c)), [[9, 10]])
})

test('maxBytes impar se rechaza', () => {
    assert.throws(() => new PcmFramer(5))
})
