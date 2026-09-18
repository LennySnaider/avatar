import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveUploadPostUsername, isAppManagedUsername } from './profileNaming.ts'

test('deriveUploadPostUsername: slug del nombre + 8 hex del id, y cumple isAppManagedUsername', () => {
    const username = deriveUploadPostUsername({ id: '3d2bfe4e-2b94-4041-a93d-03912d629214', name: 'MiaUltra' })
    assert.equal(username, 'miaultra-3d2bfe4e')
    assert.equal(isAppManagedUsername(username), true)
    assert.equal(
        deriveUploadPostUsername({ id: 'cb496b78-58df-4700-b922-0ad1fa80b375', name: 'Valeia Voss' }),
        'valeia-voss-cb496b78',
    )
})

test('deriveUploadPostUsername: nombre vacío o sólo símbolos cae a "avatar"', () => {
    assert.equal(deriveUploadPostUsername({ id: 'abcdef01-0000', name: '!!!' }), 'avatar-abcdef01')
})

test('isAppManagedUsername: los perfiles ajenos de la cuenta agencia no cumplen el patrón', () => {
    assert.equal(isAppManagedUsername('SalesBot'), false)
    assert.equal(isAppManagedUsername('lennys-pizza-pilot'), false)
    assert.equal(isAppManagedUsername('prime-avatar'), false)
})
