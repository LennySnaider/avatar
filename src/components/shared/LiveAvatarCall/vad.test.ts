import { test } from 'node:test'
import assert from 'node:assert/strict'
import { VoiceActivityDetector } from './vad.ts'

const run = (vad: VoiceActivityDetector, level: number, ms: number, sensitivity = 1) => {
    const events: string[] = []
    for (let t = 0; t < ms; t += 20) {
        const e = vad.process(level, 20, sensitivity)
        if (e) events.push(e)
    }
    return events
}

test('silencio no dispara nada', () => {
    const vad = new VoiceActivityDetector()
    assert.deepEqual(run(vad, 0.002, 2000), [])
})

test('voz sostenida empieza tras el onset y termina tras el hangover', () => {
    const vad = new VoiceActivityDetector()
    assert.deepEqual(run(vad, 0.1, 180), [])
    assert.deepEqual(run(vad, 0.1, 100), ['speech_start'])
    assert.deepEqual(run(vad, 0.001, 600), [])
    assert.deepEqual(run(vad, 0.001, 200), ['speech_end'])
})

test('un chasquido corto no cuenta como voz', () => {
    const vad = new VoiceActivityDetector()
    assert.deepEqual(run(vad, 0.2, 100), [])
    assert.deepEqual(run(vad, 0.001, 500), [])
})

test('con sensibilidad alta (avatar hablando) hace falta más voz y más tiempo', () => {
    const vad = new VoiceActivityDetector()
    // 0.015 supera el umbral normal pero no el endurecido.
    assert.deepEqual(run(vad, 0.015, 1000, 1.5), [])
    assert.deepEqual(run(vad, 0.1, 280, 1.5), [])
    assert.deepEqual(run(vad, 0.1, 40, 1.5), ['speech_start'])
})
