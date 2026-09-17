import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isStartCommand } from './classifier.ts'

// Sólo la parte PURA: `classifyInboundMessage` llama al LLM y aquí no se
// toca la red (ver global-constraints.md).

test('/start a secas es el comando de arranque', () => {
    assert.equal(isStartCommand('/start'), true)
})

test('/start con payload (deep link) también lo es', () => {
    assert.equal(isStartCommand('/start ref_abc123'), true)
})

test('los espacios de alrededor no cuentan', () => {
    assert.equal(isStartCommand('  /start  '), true)
    assert.equal(isStartCommand('\n/start promo\n'), true)
})

test('Telegram distingue mayúsculas: /START no es el comando', () => {
    assert.equal(isStartCommand('/START'), false)
    assert.equal(isStartCommand('/Start'), false)
})

test('un mensaje que sólo empieza por /start pegado no es el comando', () => {
    assert.equal(isStartCommand('/started'), false)
    assert.equal(isStartCommand('/startup ya'), false)
})

test('texto conversacional que menciona /start no es el comando', () => {
    assert.equal(isStartCommand('hola, ¿le doy a /start?'), false)
    assert.equal(isStartCommand('start'), false)
    assert.equal(isStartCommand(''), false)
    assert.equal(isStartCommand('   '), false)
})

test('otros comandos de bot no son /start', () => {
    assert.equal(isStartCommand('/help'), false)
    assert.equal(isStartCommand('/start@MiBot'), false)
})
