import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clampSinceDays, isOwnComment, pickCommenterId, rateLimitLow, shouldStopPaging } from './pollRules.ts'

test('isOwnComment: true cuando el authorId coincide en la misma red', () => {
    const own = isOwnComment(
        { authorId: 'ig-123', authorUsername: 'otro_handle' },
        [{ platform: 'instagram', accountId: 'ig-123', accountName: 'mi_avatar' }],
        'instagram',
    )
    assert.equal(own, true)
})

test('isOwnComment: true cuando el authorUsername coincide sin distinguir mayúsculas', () => {
    const own = isOwnComment(
        { authorId: null, authorUsername: 'Mi_Avatar' },
        [{ platform: 'instagram', accountId: '', accountName: 'mi_avatar' }],
        'instagram',
    )
    assert.equal(own, true)
})

test('isOwnComment: false si la cuenta propia es de otra red', () => {
    const own = isOwnComment(
        { authorId: 'x-1', authorUsername: null },
        [{ platform: 'x', accountId: 'x-1', accountName: '' }],
        'instagram',
    )
    assert.equal(own, false)
})

test('isOwnComment: false cuando no hay coincidencia de id ni username', () => {
    const own = isOwnComment(
        { authorId: 'fan-1', authorUsername: 'un_fan' },
        [{ platform: 'instagram', accountId: 'ig-123', accountName: 'mi_avatar' }],
        'instagram',
    )
    assert.equal(own, false)
})

test('isOwnComment: false sin cuentas propias configuradas', () => {
    assert.equal(isOwnComment({ authorId: 'a', authorUsername: 'b' }, [], 'instagram'), false)
})

test('pickCommenterId: prefiere authorId', () => {
    assert.equal(pickCommenterId({ authorId: 'id-1', authorUsername: 'handle' }), 'id-1')
})

test('pickCommenterId: cae a authorUsername sin authorId', () => {
    assert.equal(pickCommenterId({ authorId: null, authorUsername: 'handle' }), 'handle')
})

test('pickCommenterId: null cuando no hay ninguno', () => {
    assert.equal(pickCommenterId({ authorId: null, authorUsername: null }), null)
})

test('shouldStopPaging: para cuando hasNext es false', () => {
    assert.equal(shouldStopPaging({ page: 1, hasNext: false, hasCursor: false, sawKnown: false }), true)
})

test('shouldStopPaging: para cuando hasNext es true pero no hay cursor con el que pedir la siguiente página', () => {
    // X puede devolver has_next:true sin next_cursor — pedir de nuevo sin
    // `after` repetiría la MISMA página (doble conteo), así que para.
    assert.equal(shouldStopPaging({ page: 1, hasNext: true, hasCursor: false, sawKnown: false }), true)
})

test('shouldStopPaging: para cuando la página trajo un comentario ya conocido', () => {
    assert.equal(shouldStopPaging({ page: 1, hasNext: true, hasCursor: true, sawKnown: true }), true)
})

test('shouldStopPaging: para al llegar a la página 3 aunque haya más', () => {
    assert.equal(shouldStopPaging({ page: 3, hasNext: true, hasCursor: true, sawKnown: false }), true)
})

test('shouldStopPaging: sigue paginando antes de la página 3 con hasNext+cursor y sin comentario conocido', () => {
    assert.equal(shouldStopPaging({ page: 1, hasNext: true, hasCursor: true, sawKnown: false }), false)
    assert.equal(shouldStopPaging({ page: 2, hasNext: true, hasCursor: true, sawKnown: false }), false)
})

test('rateLimitLow: true cuando remaining < 5', () => {
    assert.equal(rateLimitLow({ remaining: 4 }), true)
    assert.equal(rateLimitLow({ remaining: 0 }), true)
})

test('rateLimitLow: false cuando remaining >= 5', () => {
    assert.equal(rateLimitLow({ remaining: 5 }), false)
    assert.equal(rateLimitLow({ remaining: 100 }), false)
})

test('rateLimitLow: false sin dato (null o ausente) — no hay señal de la que desconfiar', () => {
    assert.equal(rateLimitLow(null), false)
    assert.equal(rateLimitLow(undefined), false)
    assert.equal(rateLimitLow({ remaining: null }), false)
})

test('clampSinceDays: null (sin query param) cae al default de 7', () => {
    assert.equal(clampSinceDays(null), 7)
})

test('clampSinceDays: un valor dentro de rango se respeta', () => {
    assert.equal(clampSinceDays('30'), 30)
})

test('clampSinceDays: por encima del máximo se acota a 30', () => {
    assert.equal(clampSinceDays('99'), 30)
})

test('clampSinceDays: por debajo del mínimo (incluido 0) se acota a 1', () => {
    assert.equal(clampSinceDays('0'), 1)
    assert.equal(clampSinceDays('-5'), 1)
})

test('clampSinceDays: no numérico cae al default de 7', () => {
    assert.equal(clampSinceDays('abc'), 7)
    assert.equal(clampSinceDays(''), 7)
})
