import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    centsToUsd,
    DEFAULT_PPV_CENTS,
    isValidPpvCents,
    parseUsdToCents,
} from './pricing.ts'

test('parseUsdToCents: dólares con o sin decimales', () => {
    assert.equal(parseUsdToCents('6.50'), 650)
    assert.equal(parseUsdToCents('5'), 500)
    assert.equal(parseUsdToCents(' 12.3 '), 1230)
})

test('parseUsdToCents: acepta coma decimal (teclado en español)', () => {
    assert.equal(parseUsdToCents('6,50'), 650)
})

test('parseUsdToCents: por debajo de $3 no es un PPV válido', () => {
    assert.equal(parseUsdToCents('2.99'), null)
    assert.equal(parseUsdToCents('3'), 300)
})

test('parseUsdToCents: basura, negativos y más de 2 decimales → null', () => {
    assert.equal(parseUsdToCents(''), null)
    assert.equal(parseUsdToCents('abc'), null)
    assert.equal(parseUsdToCents('-5'), null)
    assert.equal(parseUsdToCents('5.555'), null)
})

test('parseUsdToCents: por encima del tope → null', () => {
    assert.equal(parseUsdToCents('1000.01'), null)
    assert.equal(parseUsdToCents('1000'), 100_000)
})

test('isValidPpvCents: sólo enteros en rango', () => {
    assert.equal(isValidPpvCents(DEFAULT_PPV_CENTS), true)
    assert.equal(isValidPpvCents(650.5), false)
    assert.equal(isValidPpvCents('650'), false)
    assert.equal(isValidPpvCents(299), false)
})

test('centsToUsd: para rellenar el campo', () => {
    assert.equal(centsToUsd(650), '6.50')
    assert.equal(centsToUsd(DEFAULT_PPV_CENTS), '5.00')
})
