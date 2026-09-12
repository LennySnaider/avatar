// src/lib/billing/catalog.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STAR_USD, starsToUsd, usdToTokens, MODULE_SKU, TOKEN_USD } from './catalog.ts'

test('una Star vale lo que Telegram paga al desarrollador', () => {
    assert.equal(STAR_USD, 0.013)
    assert.equal(starsToUsd(100), 1.3)
    assert.equal(starsToUsd(0), 0)
})

test('usdToTokens NO aplica margen: una comision ya es precio, no costo', () => {
    // tokensForCostUsd multiplica por COST_MARGIN porque convierte COSTO de
    // proveedor en precio de venta. Una comision del 15% ya es nuestro ingreso:
    // aplicarle margen la triplicaria.
    assert.equal(usdToTokens(1), 1 / TOKEN_USD)
    assert.equal(usdToTokens(0.195), 195)
})

test('usdToTokens redondea hacia arriba para no regalar fracciones', () => {
    assert.equal(usdToTokens(0.0001), 1)
    assert.equal(usdToTokens(0.0195), 20)
})

test('usdToTokens devuelve 0 con importes nulos o negativos', () => {
    assert.equal(usdToTokens(0), 0)
    assert.equal(usdToTokens(-1), 0)
})

test('los sku de modulo son estables y distinguen cuota de comision', () => {
    assert.equal(MODULE_SKU.fee('telegram'), 'module_fee:telegram')
    assert.equal(MODULE_SKU.commission('telegram'), 'commission:telegram')
})
