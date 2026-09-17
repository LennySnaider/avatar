import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    MAX_STAR_PRICE,
    MIN_STAR_PRICE,
    isValidStarPrice,
    resolveItemPricing,
} from './mediaPricing.ts'

test('gratis fuerza el precio a 0 aunque venga uno pegado', () => {
    assert.deepEqual(resolveItemPricing({ isFree: true, starPrice: 500 }), {
        ok: true,
        isFree: true,
        starPrice: 0,
    })
})

test('gratis sin precio también resuelve a 0', () => {
    assert.deepEqual(resolveItemPricing({ isFree: true }), {
        ok: true,
        isFree: true,
        starPrice: 0,
    })
})

test('de pago acepta los extremos del rango de Telegram', () => {
    assert.deepEqual(resolveItemPricing({ starPrice: MIN_STAR_PRICE }), {
        ok: true,
        isFree: false,
        starPrice: 1,
    })
    assert.deepEqual(resolveItemPricing({ isFree: false, starPrice: MAX_STAR_PRICE }), {
        ok: true,
        isFree: false,
        starPrice: 25_000,
    })
})

test('de pago rechaza 0 — es justo lo que el check reserva para los gratis', () => {
    const result = resolveItemPricing({ isFree: false, starPrice: 0 })
    assert.equal(result.ok, false)
    if (!result.ok) assert.match(result.error, /entre 1 y 25000/)
})

test('de pago rechaza fuera de rango, decimales y ausencia de precio', () => {
    for (const starPrice of [-1, 25_001, 12.5, Number.NaN, undefined]) {
        assert.equal(
            resolveItemPricing({ starPrice: starPrice as number | undefined }).ok,
            false,
            `debería rechazar ${String(starPrice)}`,
        )
    }
})

test('isValidStarPrice no se deja engañar por strings ni por null', () => {
    assert.equal(isValidStarPrice(50), true)
    assert.equal(isValidStarPrice('50'), false)
    assert.equal(isValidStarPrice(null), false)
    assert.equal(isValidStarPrice(undefined), false)
})
