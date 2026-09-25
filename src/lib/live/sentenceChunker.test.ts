import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SentenceChunker, sanitizeForSpeech } from './sentenceChunker.ts'

test('emite cada oración en cuanto se cierra y guarda el resto', () => {
    const c = new SentenceChunker()
    assert.deepEqual(c.push('Hola, ¿qué tal'), [])
    assert.deepEqual(c.push(' estás hoy? Yo muy'), ['Hola, ¿qué tal estás hoy?'])
    assert.deepEqual(c.push(' bien, gracias.'), [])
    assert.deepEqual(c.push(' ¿Y tú?'), ['Yo muy bien, gracias.'])
    assert.equal(c.flush(), '¿Y tú?')
    assert.equal(c.flush(), null)
})

test('un cierre a mitad de token no corta: "3.5 kilos" sigue junto', () => {
    const c = new SentenceChunker()
    assert.deepEqual(c.push('Pesa 3.5 kilos y mide poco.'), [])
    assert.deepEqual(c.push(' '), ['Pesa 3.5 kilos y mide poco.'])
})

test('un fragmento muy corto se pega a la frase siguiente', () => {
    const c = new SentenceChunker()
    assert.deepEqual(c.push('Sí. Claro que sí, cuando quieras. '), ['Sí. Claro que sí, cuando quieras.'])
})

test('una frase sin cierre se corta en una pausa al pasar de maxChars', () => {
    const c = new SentenceChunker({ maxChars: 40, softMinChars: 10 })
    const out = c.push('esto es una frase larguísima, que sigue y sigue sin parar nunca jamás de los jamases')
    assert.equal(out[0], 'esto es una frase larguísima,')
})

test('el salto de línea también cierra', () => {
    const c = new SentenceChunker()
    assert.deepEqual(c.push('Primera línea del mensaje\nsegunda'), ['Primera línea del mensaje'])
})

test('sanitizeForSpeech quita acotaciones, markdown, emojis, URLs y hashtags', () => {
    assert.equal(
        sanitizeForSpeech('*ríe* Hola **guapo** 😘 mira https://x.com/a #amor [suspira] (se sonroja) ¿vale?'),
        'Hola guapo mira ¿vale?',
    )
})
