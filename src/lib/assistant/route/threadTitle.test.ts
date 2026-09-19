// src/lib/assistant/route/threadTitle.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NEW_THREAD_TITLE, THREAD_TITLE_MAX, deriveThreadTitle } from './threadTitle.ts'

test('deriveThreadTitle: el título es el texto del usuario', () => {
    assert.equal(
        deriveThreadTitle([{ type: 'text', text: '¿cómo va instagram?' }]),
        '¿cómo va instagram?',
    )
})

test('deriveThreadTitle: varias partes de texto se unen con un espacio', () => {
    assert.equal(
        deriveThreadTitle([
            { type: 'text', text: 'resumen' },
            { type: 'text', text: 'de la semana' },
        ]),
        'resumen de la semana',
    )
})

test('deriveThreadTitle: los saltos de línea y espacios sobrantes se colapsan', () => {
    assert.equal(
        deriveThreadTitle([{ type: 'text', text: '  hola \n\n  mundo  ' }]),
        'hola mundo',
    )
})

test(`deriveThreadTitle: nunca pasa de ${THREAD_TITLE_MAX} caracteres`, () => {
    const largo = 'a'.repeat(200)
    const titulo = deriveThreadTitle([{ type: 'text', text: largo }])
    assert.equal(titulo.length, THREAD_TITLE_MAX)
})

test('deriveThreadTitle: las partes que no son texto se ignoran', () => {
    assert.equal(
        deriveThreadTitle([
            { type: 'step-start' },
            { type: 'file', url: 'https://x/y.png' },
            { type: 'text', text: 'analiza esto' },
        ]),
        'analiza esto',
    )
})

test('deriveThreadTitle: sin texto utilizable cae a un título por defecto', () => {
    for (const basura of [undefined, null, [], 'texto', 42, [{ type: 'text' }], [{ type: 'text', text: '   ' }]]) {
        assert.equal(
            deriveThreadTitle(basura),
            NEW_THREAD_TITLE,
            `falla con ${JSON.stringify(basura)}`,
        )
    }
})
