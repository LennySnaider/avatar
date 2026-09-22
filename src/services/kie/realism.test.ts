import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    appendRealism,
    REALISM_CLAUSE,
    REALISM_CLAUSES,
    REALISM_DEFAULT_LEVEL,
    realismTier,
} from './realism.ts'

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

test('tramos: el slider elige redacción; sin nivel = Natural (el validado)', () => {
    assert.equal(realismTier(undefined), 'natural')
    assert.equal(realismTier(null), 'natural')
    assert.equal(realismTier(Number.NaN), 'natural')
    assert.equal(realismTier(0), 'subtle')
    assert.equal(realismTier(33), 'subtle')
    assert.equal(realismTier(34), 'natural')
    assert.equal(realismTier(REALISM_DEFAULT_LEVEL), 'natural')
    assert.equal(realismTier(66), 'natural')
    assert.equal(realismTier(67), 'raw')
    assert.equal(realismTier(250), 'raw')
    assert.equal(realismTier(-5), 'subtle')
})

test('Natural es exactamente el texto validado en el A/B', () => {
    assert.equal(REALISM_CLAUSES.natural, REALISM_CLAUSE)
    assert.equal(
        appendRealism('Escena.', true, 4800, 50),
        `Escena. ${REALISM_CLAUSE}`,
    )
})

test('cada tramo añade SU texto', () => {
    assert.equal(
        appendRealism('Escena.', true, 4800, 10),
        `Escena. ${REALISM_CLAUSES.subtle}`,
    )
    assert.equal(
        appendRealism('Escena.', true, 4800, 90),
        `Escena. ${REALISM_CLAUSES.raw}`,
    )
})

test('ningún tramo nombra rasgos que el motor saturaría, y todos son cortos', () => {
    for (const [tier, clause] of Object.entries(REALISM_CLAUSES)) {
        assert.doesNotMatch(
            clause,
            /freckle|mole|blemish|acne|scar|imperfection/i,
            tier,
        )
        assert.ok(clause.length < 400, `${tier} mide ${clause.length}`)
    }
})
