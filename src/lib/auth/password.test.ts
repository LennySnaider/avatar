import test from 'node:test'
import assert from 'node:assert/strict'
import { hashPassword, verifyPassword } from './password'

/**
 * Prueba de la primitiva de contraseñas. NO toca la base de datos: scrypt es
 * puro, así que todo lo que hay que demostrar (que lo guardado no es texto
 * plano, que la correcta entra y la incorrecta no) se demuestra en memoria.
 * Correrla contra la BD de producción sólo añadiría el riesgo de dejar a
 * alguien fuera de su propia app sin aportar ninguna certeza extra.
 */

test('hashPassword no guarda la contraseña en claro', async () => {
    const stored = await hashPassword('Un4-Contrasena-De-Prueba')
    assert.ok(!stored.includes('Un4-Contrasena-De-Prueba'))
    // Formato documentado: scrypt$N$r$p$salt$hash
    const parts = stored.split('$')
    assert.equal(parts.length, 6)
    assert.equal(parts[0], 'scrypt')
})

test('verifyPassword acepta la correcta y rechaza la incorrecta', async () => {
    const stored = await hashPassword('Un4-Contrasena-De-Prueba')
    assert.equal(await verifyPassword('Un4-Contrasena-De-Prueba', stored), true)
    assert.equal(await verifyPassword('otra-cosa', stored), false)
    // Un byte de diferencia tampoco pasa (timingSafeEqual, no comparación laxa).
    assert.equal(await verifyPassword('Un4-Contrasena-De-Prueb', stored), false)
    assert.equal(await verifyPassword('', stored), false)
})

test('dos hashes de la misma contraseña son distintos (salt aleatorio)', async () => {
    const a = await hashPassword('misma-contrasena')
    const b = await hashPassword('misma-contrasena')
    assert.notEqual(a, b)
    // …y aun así los dos validan: el salt va dentro del propio registro.
    assert.equal(await verifyPassword('misma-contrasena', a), true)
    assert.equal(await verifyPassword('misma-contrasena', b), true)
})

test('un hash corrupto o de otro esquema devuelve false, no lanza', async () => {
    assert.equal(await verifyPassword('x', 'no-es-un-hash'), false)
    assert.equal(await verifyPassword('x', 'bcrypt$1$2$3$4$5'), false)
    assert.equal(await verifyPassword('x', ''), false)
})
