import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveDeliveryChannel } from './channelRouting.ts'

test('fanvue va por fanvue', () => {
    assert.equal(resolveDeliveryChannel('fanvue'), 'fanvue')
})

test('telegram va por telegram', () => {
    assert.equal(resolveDeliveryChannel('telegram'), 'telegram')
})

test('telegram_business también va por telegram (mismo Bot API; llegará en otro plan)', () => {
    assert.equal(resolveDeliveryChannel('telegram_business'), 'telegram')
})

test('cualquier otra cosa, incluido vacío, cae en fanvue: es el comportamiento histórico', () => {
    assert.equal(resolveDeliveryChannel(''), 'fanvue')
    assert.equal(resolveDeliveryChannel('instagram'), 'fanvue')
})
