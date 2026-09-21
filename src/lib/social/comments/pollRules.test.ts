import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    chunk,
    clampSinceDays,
    filterOutOwnReplies,
    isOwnComment,
    pickCommenterId,
    postNeedsSync,
    rateLimitLow,
    shouldStopPaging,
    targetPlatformConnected,
} from './pollRules.ts'

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

test('chunk: array vacío da lista de trozos vacía', () => {
    assert.deepEqual(chunk([], 100), [])
})

test('chunk: 250 elementos en trozos de 100 da [100, 100, 50]', () => {
    const arr = Array.from({ length: 250 }, (_, i) => i)
    const chunks = chunk(arr, 100)
    assert.deepEqual(
        chunks.map((c) => c.length),
        [100, 100, 50],
    )
    // El orden y el contenido se conservan — sin huecos ni duplicados.
    assert.deepEqual(chunks.flat(), arr)
})

test('chunk: un array más chico que size da un solo trozo', () => {
    assert.deepEqual(chunk([1, 2, 3], 100), [[1, 2, 3]])
})

test('chunk: size que divide exacto no deja un trozo final vacío', () => {
    const arr = Array.from({ length: 200 }, (_, i) => i)
    assert.deepEqual(
        chunk(arr, 100).map((c) => c.length),
        [100, 100],
    )
})

test('postNeedsSync: sin ningún target todavía, sí hace falta (sin importar la edad)', () => {
    const now = new Date('2026-09-16T12:00:00Z')
    assert.equal(postNeedsSync({ publishedAt: null, targetCount: 0, now }), true)
    assert.equal(
        postNeedsSync({ publishedAt: '2020-01-01T00:00:00Z', targetCount: 0, now }),
        true,
    )
})

test('postNeedsSync: con un target y publicado hace 30 minutos, sí hace falta (puede faltar otra plataforma)', () => {
    const now = new Date('2026-09-16T12:00:00Z')
    assert.equal(
        postNeedsSync({ publishedAt: '2026-09-16T11:30:00Z', targetCount: 1, now }),
        true,
    )
})

test('postNeedsSync: con un target y publicado hace 3 horas, ya no hace falta (asentado)', () => {
    const now = new Date('2026-09-16T12:00:00Z')
    assert.equal(
        postNeedsSync({ publishedAt: '2026-09-16T09:00:00Z', targetCount: 1, now }),
        false,
    )
})

test('postNeedsSync: con un target pero sin publishedAt, no hace falta (no hay edad que evaluar)', () => {
    const now = new Date('2026-09-16T12:00:00Z')
    assert.equal(postNeedsSync({ publishedAt: null, targetCount: 1, now }), false)
})

test('postNeedsSync: publishedAt inválido con targets se trata igual que ausente', () => {
    const now = new Date('2026-09-16T12:00:00Z')
    assert.equal(postNeedsSync({ publishedAt: 'no-es-una-fecha', targetCount: 1, now }), false)
})

// ---------------------------------------------------------------------------
// filterOutOwnReplies (cinturón contra el bucle de auto-respuesta)
// ---------------------------------------------------------------------------

test('saca los comentarios cuyo id ya es un mensaje saliente nuestro', () => {
    const comments = [{ id: 'c1' }, { id: 'nuestra-respuesta' }, { id: 'c2' }]
    const kept = filterOutOwnReplies(comments, new Set(['nuestra-respuesta']))
    assert.deepEqual(kept.map((c) => c.id), ['c1', 'c2'])
})

test('sin ids conocidos devuelve la misma lista (misma referencia, sin copiar)', () => {
    const comments = [{ id: 'c1' }, { id: 'c2' }]
    assert.equal(filterOutOwnReplies(comments, new Set()), comments)
})

test('si TODA la página es nuestra, la lista queda vacía (no se ingiere nada)', () => {
    const comments = [{ id: 'a' }, { id: 'b' }]
    assert.deepEqual(filterOutOwnReplies(comments, new Set(['a', 'b'])), [])
})

// ---------------------------------------------------------------------------
// targetPlatformConnected (targets de redes que ya no están conectadas)
// ---------------------------------------------------------------------------

const soloInstagram = [
    { platform: 'instagram', accountId: '259', accountName: 'emily_of26' },
]

test('targetPlatformConnected: la red del target está entre las conectadas', () => {
    assert.equal(targetPlatformConnected('instagram', soloInstagram), true)
})

test('targetPlatformConnected: X ya no está conectada (caso real tras la migración a la cuenta agencia)', () => {
    assert.equal(targetPlatformConnected('x', soloInstagram), false)
})

test('targetPlatformConnected: compara la red sin distinguir mayúsculas', () => {
    assert.equal(targetPlatformConnected('Instagram', soloInstagram), true)
})

test('targetPlatformConnected: sin cuentas conocidas no filtra (falta de dato, no "nada conectado")', () => {
    assert.equal(targetPlatformConnected('x', []), true)
})
