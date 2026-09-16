import { test } from 'node:test'
import assert from 'node:assert/strict'
import { commentDmEligibility, sanitizeDmButtons } from './dmEligibility.ts'

const NOW = new Date('2026-09-16T12:00:00.000Z')

function baseInput(overrides: Partial<Parameters<typeof commentDmEligibility>[0]> = {}) {
    return {
        platform: 'instagram',
        dmEnabled: true,
        dmText: 'Gracias por comentar, te mando más info por aquí',
        commentTimestamp: '2026-09-16T10:00:00.000Z',
        now: NOW,
        alreadySent: false,
        ...overrides,
    }
}

test('elegible cuando todo cumple', () => {
    const res = commentDmEligibility(baseInput())
    assert.equal(res.eligible, true)
    assert.equal(res.reason, 'ok')
})

test('not_instagram: cualquier otra red se descarta', () => {
    assert.deepEqual(commentDmEligibility(baseInput({ platform: 'x' })), {
        eligible: false,
        reason: 'not_instagram',
    })
    assert.deepEqual(commentDmEligibility(baseInput({ platform: 'tiktok' })), {
        eligible: false,
        reason: 'not_instagram',
    })
    assert.deepEqual(commentDmEligibility(baseInput({ platform: null })), {
        eligible: false,
        reason: 'not_instagram',
    })
})

test('dm_disabled: el interruptor de la red está apagado', () => {
    assert.deepEqual(commentDmEligibility(baseInput({ dmEnabled: false })), {
        eligible: false,
        reason: 'dm_disabled',
    })
})

test('empty_text: sin texto configurado (null o solo espacios) no hay qué mandar', () => {
    assert.deepEqual(commentDmEligibility(baseInput({ dmText: null })), {
        eligible: false,
        reason: 'empty_text',
    })
    assert.deepEqual(commentDmEligibility(baseInput({ dmText: '   ' })), {
        eligible: false,
        reason: 'empty_text',
    })
})

test('already_sent: ya hay fila para este (avatar, post, comentarista)', () => {
    assert.deepEqual(commentDmEligibility(baseInput({ alreadySent: true })), {
        eligible: false,
        reason: 'already_sent',
    })
})

test('comment_too_old: timestamp null cuenta como viejo — Meta rechaza >7d y no podemos probar la edad', () => {
    assert.deepEqual(commentDmEligibility(baseInput({ commentTimestamp: null })), {
        eligible: false,
        reason: 'comment_too_old',
    })
})

test('comment_too_old: timestamp inválido también cuenta como viejo', () => {
    assert.deepEqual(commentDmEligibility(baseInput({ commentTimestamp: 'no-es-una-fecha' })), {
        eligible: false,
        reason: 'comment_too_old',
    })
})

test('frontera de 7 días: justo en el límite todavía es elegible', () => {
    const sevenDaysBefore = new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const res = commentDmEligibility(baseInput({ commentTimestamp: sevenDaysBefore }))
    assert.equal(res.eligible, true)
})

test('frontera de 7 días: un milisegundo más viejo ya no es elegible', () => {
    const justOver = new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000 - 1).toISOString()
    assert.deepEqual(commentDmEligibility(baseInput({ commentTimestamp: justOver })), {
        eligible: false,
        reason: 'comment_too_old',
    })
})

test('un comentario futuro (reloj desfasado) no cuenta como viejo', () => {
    const inTheFuture = new Date(NOW.getTime() + 60_000).toISOString()
    const res = commentDmEligibility(baseInput({ commentTimestamp: inTheFuture }))
    assert.equal(res.eligible, true)
})

test('el orden de prioridad es not_instagram antes que el resto', () => {
    const res = commentDmEligibility(
        baseInput({ platform: 'x', dmEnabled: false, dmText: null, alreadySent: true }),
    )
    assert.equal(res.reason, 'not_instagram')
})

test('sanitizeDmButtons: no-array vuelve []', () => {
    assert.deepEqual(sanitizeDmButtons(undefined), [])
    assert.deepEqual(sanitizeDmButtons(null), [])
    assert.deepEqual(sanitizeDmButtons('nope'), [])
    assert.deepEqual(sanitizeDmButtons({ title: 'x', url: 'https://x.com' }), [])
})

test('sanitizeDmButtons: se queda con botones válidos (title no vacío ≤20, url http/https)', () => {
    const res = sanitizeDmButtons([{ title: 'Ver más', url: 'https://example.com/promo' }])
    assert.deepEqual(res, [{ title: 'Ver más', url: 'https://example.com/promo' }])
})

test('sanitizeDmButtons: descarta title vacío, title >20 chars y url no http(s)', () => {
    const res = sanitizeDmButtons([
        { title: '', url: 'https://example.com' },
        { title: 'Este título tiene más de veinte caracteres', url: 'https://example.com' },
        { title: 'Ok', url: 'ftp://example.com' },
        { title: 'Ok', url: 'javascript:alert(1)' },
    ])
    assert.deepEqual(res, [])
})

test('sanitizeDmButtons: se queda con máximo 3, descarta el resto', () => {
    const raw = [
        { title: 'Uno', url: 'https://example.com/1' },
        { title: 'Dos', url: 'https://example.com/2' },
        { title: 'Tres', url: 'https://example.com/3' },
        { title: 'Cuatro', url: 'https://example.com/4' },
    ]
    const res = sanitizeDmButtons(raw)
    assert.equal(res.length, 3)
    assert.deepEqual(res, raw.slice(0, 3))
})

test('sanitizeDmButtons: title exactamente de 20 caracteres se acepta', () => {
    const title20 = '12345678901234567890'.slice(0, 20)
    assert.equal(title20.length, 20)
    const res = sanitizeDmButtons([{ title: title20, url: 'https://example.com' }])
    assert.equal(res.length, 1)
})

test('sanitizeDmButtons: ítems que no son objetos se ignoran sin romper el resto', () => {
    const res = sanitizeDmButtons([null, 42, 'x', { title: 'Ok', url: 'https://example.com' }])
    assert.deepEqual(res, [{ title: 'Ok', url: 'https://example.com' }])
})
