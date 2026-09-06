import test from 'node:test'
import assert from 'node:assert/strict'
import {
    RESET_TOKEN_TTL_MINUTES,
    generateResetToken,
    hashResetToken,
    isResetTokenUsable,
    resetTokenHashEquals,
} from './resetToken'

/**
 * Pruebas de la primitiva de tokens de reset. NO tocan la base de datos, igual
 * que password.test.ts: generación, hasheo y vigencia son funciones puras, así
 * que todo lo que hay que demostrar se demuestra en memoria. Escribir tokens
 * de verdad en la tabla para probar esto sólo añadiría filas vivas —enlaces
 * utilizables— sin aportar ninguna certeza extra.
 */

test('el token es de alta entropía y no se repite', () => {
    const a = generateResetToken()
    const b = generateResetToken()

    // 32 bytes en base64url → 43 caracteres sin relleno.
    assert.equal(a.token.length, 43)
    // base64url: nada de +, / ni = (romperían la query string del enlace).
    assert.match(a.token, /^[A-Za-z0-9_-]+$/)
    assert.notEqual(a.token, b.token)
    assert.notEqual(a.tokenHash, b.tokenHash)
})

test('lo que se persiste es el hash, no el token', () => {
    const { token, tokenHash } = generateResetToken()

    assert.notEqual(tokenHash, token)
    assert.ok(!tokenHash.includes(token))
    // SHA-256 en hexadecimal minúscula: 64 caracteres.
    assert.match(tokenHash, /^[0-9a-f]{64}$/)
})

test('hashResetToken es determinista (si no, no se podría indexar ni buscar)', () => {
    const { token, tokenHash } = generateResetToken()

    assert.equal(hashResetToken(token), tokenHash)
    assert.equal(hashResetToken(token), hashResetToken(token))
    // Un carácter distinto es un hash completamente distinto.
    assert.notEqual(hashResetToken(token + 'x'), tokenHash)
})

test('la caducidad se calcula desde el reloj que se le pasa', () => {
    const now = new Date('2026-01-01T12:00:00.000Z')
    const { expiresAt } = generateResetToken(now)

    assert.equal(
        expiresAt.getTime() - now.getTime(),
        RESET_TOKEN_TTL_MINUTES * 60_000,
    )
    assert.equal(expiresAt.toISOString(), '2026-01-01T12:30:00.000Z')
})

test('un token recién emitido sirve; uno caducado no', () => {
    const now = new Date('2026-01-01T12:00:00.000Z')
    const { expiresAt } = generateResetToken(now)

    assert.equal(isResetTokenUsable({ expiresAt, usedAt: null }, now), true)

    // Un segundo antes de caducar: todavía vale.
    const casi = new Date(expiresAt.getTime() - 1000)
    assert.equal(isResetTokenUsable({ expiresAt, usedAt: null }, casi), true)

    // Justo en el límite: NO vale (la comparación es estrictamente mayor).
    assert.equal(
        isResetTokenUsable({ expiresAt, usedAt: null }, expiresAt),
        false,
    )

    const tarde = new Date(expiresAt.getTime() + 1)
    assert.equal(isResetTokenUsable({ expiresAt, usedAt: null }, tarde), false)
})

test('un token ya usado no vale aunque no haya caducado', () => {
    const now = new Date('2026-01-01T12:00:00.000Z')
    const { expiresAt } = generateResetToken(now)

    assert.equal(
        isResetTokenUsable(
            { expiresAt, usedAt: '2026-01-01T12:05:00.000Z' },
            now,
        ),
        false,
    )
    // Un token de un solo uso que se puede repetir es un token permanente.
    assert.equal(
        isResetTokenUsable({ expiresAt, usedAt: new Date(now) }, now),
        false,
    )
})

test('acepta las fechas como texto (que es como vuelven de la base)', () => {
    const now = new Date('2026-01-01T12:00:00.000Z')

    assert.equal(
        isResetTokenUsable(
            { expiresAt: '2026-01-01T12:30:00.000Z', usedAt: null },
            now,
        ),
        true,
    )
    assert.equal(
        isResetTokenUsable(
            { expiresAt: '2026-01-01T11:30:00.000Z', usedAt: null },
            now,
        ),
        false,
    )
})

test('una caducidad ilegible se rechaza, no se da por buena', () => {
    const now = new Date('2026-01-01T12:00:00.000Z')

    assert.equal(
        isResetTokenUsable({ expiresAt: 'ayer', usedAt: null }, now),
        false,
    )
    assert.equal(
        isResetTokenUsable({ expiresAt: '', usedAt: null }, now),
        false,
    )
})

test('resetTokenHashEquals compara sin filtrar y sin lanzar por longitudes distintas', () => {
    const { token, tokenHash } = generateResetToken()

    assert.equal(resetTokenHashEquals(tokenHash, hashResetToken(token)), true)
    assert.equal(resetTokenHashEquals(tokenHash, hashResetToken('otro')), false)
    // timingSafeEqual lanza si los buffers miden distinto: aquí se corta antes.
    assert.equal(resetTokenHashEquals(tokenHash, 'corto'), false)
    assert.equal(resetTokenHashEquals('', tokenHash), false)
})
