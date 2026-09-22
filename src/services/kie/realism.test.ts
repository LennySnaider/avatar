import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendRealism, REALISM_CLAUSE } from './realism.ts'

test('apagado: el prompt sale byte-idéntico', () => {
    const prompt = 'A woman by the window holding a mug.'
    assert.equal(appendRealism(prompt, false, 4800), prompt)
    assert.equal(appendRealism(prompt, undefined, 4800), prompt)
})

test('encendido: el bloque va al FINAL, separado por un espacio', () => {
    const out = appendRealism('A woman by the window.  ', true, 4800)
    assert.equal(out, `A woman by the window. ${REALISM_CLAUSE}`)
})

test('si no cabe en el límite de la API, no se añade (nunca se recorta la escena)', () => {
    const prompt = 'x'.repeat(4700)
    assert.equal(appendRealism(prompt, true, 4800), prompt)
})

test('el bloque no nombra rasgos que el motor saturaría', () => {
    assert.doesNotMatch(
        REALISM_CLAUSE,
        /freckle|mole|blemish|acne|scar|imperfection/i,
    )
})

test('el bloque es corto: acabado, no identidad', () => {
    assert.ok(REALISM_CLAUSE.length < 400, `mide ${REALISM_CLAUSE.length}`)
})
