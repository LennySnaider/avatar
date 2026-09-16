import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fanMemoryPlatform } from './fanMemoryPlatform.ts'

test('fanvue guarda memoria bajo fanvue', () => {
    assert.equal(fanMemoryPlatform('fanvue'), 'fanvue')
})

test('telegram guarda memoria bajo telegram', () => {
    assert.equal(fanMemoryPlatform('telegram'), 'telegram')
})

test('telegram_business comparte memoria con telegram: es la misma persona hablando con el mismo fan', () => {
    assert.equal(fanMemoryPlatform('telegram_business'), 'telegram')
})

test('lo desconocido cae en fanvue, como siempre', () => {
    assert.equal(fanMemoryPlatform(''), 'fanvue')
})
