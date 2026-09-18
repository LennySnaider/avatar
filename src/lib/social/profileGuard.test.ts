import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertActiveProfile, INACTIVE_PROFILE_MESSAGE } from './profileGuard.ts'

test('assertActiveProfile: un perfil active pasa', () => {
    assert.doesNotThrow(() => assertActiveProfile({ status: 'active' }))
})

test('assertActiveProfile: cualquier otro estado lanza con el mensaje de "crear o asignar"', () => {
    assert.throws(() => assertActiveProfile({ status: 'disconnected' }), { message: INACTIVE_PROFILE_MESSAGE })
    assert.throws(() => assertActiveProfile({ status: '' }), { message: INACTIVE_PROFILE_MESSAGE })
})
