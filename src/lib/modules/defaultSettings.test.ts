// src/lib/modules/defaultSettings.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { settingsAfterInstall } from './defaultSettings.ts'

test('fila sin ajustes (undefined) recibe los defaults de strategist', () => {
    const out = settingsAfterInstall('strategist', undefined)
    assert.deepEqual(out, {
        dailyTokenCap: 200_000,
        perTurnTokenCap: 20_000,
        mode: 'approve',
    })
})

test('fila con settings null recibe los defaults', () => {
    const out = settingsAfterInstall('strategist', null)
    assert.deepEqual(out, {
        dailyTokenCap: 200_000,
        perTurnTokenCap: 20_000,
        mode: 'approve',
    })
})

test('fila con settings {} recibe los defaults', () => {
    const out = settingsAfterInstall('strategist', {})
    assert.deepEqual(out, {
        dailyTokenCap: 200_000,
        perTurnTokenCap: 20_000,
        mode: 'approve',
    })
})

test('una fila que ya tiene ajustes NO se toca (reinstalación)', () => {
    const existentes = {
        dailyTokenCap: 5_000,
        perTurnTokenCap: 500,
        mode: 'approve',
    }
    const out = settingsAfterInstall('strategist', existentes)
    assert.equal(out, undefined)
})

test('un módulo sin defaults propios no siembra nada', () => {
    const out = settingsAfterInstall('telegram', undefined)
    assert.equal(out, undefined)
})

test('el resultado es una copia, no la referencia del default compartido', () => {
    const a = settingsAfterInstall('strategist', undefined)
    const b = settingsAfterInstall('strategist', undefined)
    assert.notEqual(a, b)
    assert.deepEqual(a, b)
})
