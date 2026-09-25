import { test } from 'node:test'
import assert from 'node:assert/strict'
import { promptChannelFor, resolveDeliveryChannel } from './channelRouting.ts'

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

test('social:<red> va por social_comment', () => {
    assert.equal(resolveDeliveryChannel('social:instagram'), 'social_comment')
    assert.equal(resolveDeliveryChannel('social:x'), 'social_comment')
})

test('promptChannelFor coincide con resolveDeliveryChannel para los tres canales', () => {
    assert.equal(promptChannelFor('fanvue'), 'fanvue')
    assert.equal(promptChannelFor('telegram'), 'telegram')
    assert.equal(promptChannelFor('telegram_business'), 'telegram')
    assert.equal(promptChannelFor('social:instagram'), 'social_comment')
    assert.equal(promptChannelFor('social:x'), 'social_comment')
    assert.equal(promptChannelFor(''), 'fanvue')
})

test('live (módulo live_avatar) va por su propio canal, nunca cae en fanvue', () => {
    assert.equal(resolveDeliveryChannel('live'), 'live')
    assert.equal(resolveDeliveryChannel('live:widget'), 'live')
    assert.equal(promptChannelFor('live'), 'live')
    // Un prefijo parecido no cuenta.
    assert.equal(resolveDeliveryChannel('liveaudio'), 'fanvue')
})
