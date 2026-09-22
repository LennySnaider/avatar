import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inspectMp4Audio, isSilentVideo } from './mp4Audio.ts'

// Constructores mínimos de cajas ISO-BMFF — lo justo que lee el parser.
const u32 = (n: number) => {
    const b = new Uint8Array(4)
    new DataView(b.buffer).setUint32(0, n)
    return b
}
const cat = (...parts: Uint8Array[]) => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
    let o = 0
    for (const p of parts) {
        out.set(p, o)
        o += p.length
    }
    return out
}
const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)))
const box = (type: string, ...payload: Uint8Array[]) => {
    const body = cat(...payload)
    return cat(u32(8 + body.length), ascii(type), body)
}
const hdlr = (handler: string) => box('hdlr', u32(0), u32(0), ascii(handler), u32(0), u32(0), u32(0))
// mdhd v0: version/flags, creación, modificación, timescale, duración.
const mdhd = (timescale: number, duration: number) =>
    box('mdhd', u32(0), u32(0), u32(0), u32(timescale), u32(duration), u32(0))
const stsz = (sizes: number[]) => box('stsz', u32(0), u32(0), u32(sizes.length), ...sizes.map(u32))
const trak = (handler: string, extra: Uint8Array[] = []) =>
    box('trak', box('mdia', hdlr(handler), ...extra))
const audioTrak = (seconds: number, bytesPerSecond: number) =>
    trak('soun', [
        mdhd(1000, seconds * 1000),
        // Una muestra por segundo con el tamaño pedido.
        box('minf', box('stbl', stsz(Array(seconds).fill(bytesPerSecond)))),
    ])
const mp4 = (...moovChildren: Uint8Array[]) =>
    cat(box('ftyp', ascii('isom')), box('moov', ...moovChildren), box('mdat', new Uint8Array(64)))

test('sin moov (no es MP4) → no se sabe, y no se pregunta', () => {
    assert.equal(inspectMp4Audio(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0])), null)
    assert.equal(isSilentVideo(null), false)
})

test('solo pista de vídeo → mudo (el caso de Wan / Seedance)', () => {
    const info = inspectMp4Audio(mp4(trak('vide')))
    assert.deepEqual(info, { hasAudioTrack: false, audioKbps: null })
    assert.equal(isSilentVideo(info), true)
})

test('pista de audio real (~192 kbps, como el export del editor) → suena', () => {
    const info = inspectMp4Audio(mp4(trak('vide'), audioTrak(5, 24_000)))
    assert.equal(info?.hasAudioTrack, true)
    assert.ok(Math.abs((info?.audioKbps ?? 0) - 192) < 0.01)
    assert.equal(isSilentVideo(info), false)
})

test('pista de audio que solo codifica silencio → mudo', () => {
    const info = inspectMp4Audio(mp4(trak('vide'), audioTrak(5, 200)))
    assert.equal(info?.hasAudioTrack, true)
    assert.equal(isSilentVideo(info), true)
})

test('moov DETRÁS de mdat (sin faststart) también se lee', () => {
    const bytes = cat(
        box('ftyp', ascii('isom')),
        box('mdat', new Uint8Array(128)),
        box('moov', trak('vide'), audioTrak(3, 16_000)),
    )
    assert.equal(isSilentVideo(inspectMp4Audio(bytes)), false)
})

test('MP4 fragmentado con audio: no se puede medir → se asume que suena', () => {
    const info = inspectMp4Audio(mp4(box('mvex'), trak('vide'), trak('soun')))
    assert.deepEqual(info, { hasAudioTrack: true, audioKbps: null })
    assert.equal(isSilentVideo(info), false)
})
