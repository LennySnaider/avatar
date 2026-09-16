import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    normalizeComment,
    normalizeCommentsPage,
    normalizeHistoryEntry,
    isReauthRequiredBody,
    toIsoTimestamp,
} from './normalize.ts'

// ---------------------------------------------------------------------------
// normalizeComment / normalizeCommentsPage
// ---------------------------------------------------------------------------

test('normaliza la forma de la doc: user.id / user.username', () => {
    const comment = normalizeComment('instagram', {
        id: 'c1',
        text: 'hola!',
        timestamp: '2026-09-16T12:00:00Z',
        user: { id: 'u1', username: 'fan_uno' },
    })
    assert.deepEqual(comment, {
        id: 'c1',
        text: 'hola!',
        timestamp: '2026-09-16T12:00:00.000Z',
        authorId: 'u1',
        authorUsername: 'fan_uno',
    })
})

test('X puede devolver una página vacía con has_next=true, sin tirar', () => {
    const page = normalizeCommentsPage('x', {
        success: true,
        comments: [],
        pagination: { next_cursor: 'abc123', has_next: true },
        source: 'mentions',
    })
    assert.deepEqual(page, {
        comments: [],
        nextCursor: 'abc123',
        hasNext: true,
        source: 'mentions',
    })
})

test('un item sin id se descarta, no rompe el resto de la página', () => {
    const page = normalizeCommentsPage('facebook', {
        comments: [
            { id: 'keep-1', text: 'ok', timestamp: null, user: { id: 'u', username: 'u' } },
            { text: 'sin id, se cae', user: { id: 'u2', username: 'u2' } },
        ],
        pagination: { next_cursor: null, has_next: false },
        source: null,
    })
    assert.deepEqual(page.comments.map((c) => c.id), ['keep-1'])
    assert.equal(page.nextCursor, null)
    assert.equal(page.hasNext, false)
})

test('shape alternativo from.username (en vez de user.username)', () => {
    const comment = normalizeComment('threads', {
        id: 'c2',
        message: 'otra forma de texto',
        created_time: '2026-09-16T13:00:00Z',
        from: { id: 'u9', username: 'otro_fan' },
    })
    assert.deepEqual(comment, {
        id: 'c2',
        text: 'otra forma de texto',
        timestamp: '2026-09-16T13:00:00.000Z',
        authorId: 'u9',
        authorUsername: 'otro_fan',
    })
})

// ---------------------------------------------------------------------------
// normalizeHistoryEntry
// ---------------------------------------------------------------------------

test('entrada de historial con success=false y ids nulos', () => {
    const entry = normalizeHistoryEntry({
        platform: 'instagram',
        media_type: 'photo',
        upload_timestamp: '2026-09-16T10:00:00Z',
        success: false,
        error_code: 'account_reauth_required',
        failure_stage: 'publish',
        platform_post_id: null,
        post_url: null,
        post_caption: 'caption de prueba',
        post_title: null,
        request_id: 'req-1',
        job_id: null,
        request_total_platforms: 1,
    })
    assert.deepEqual(entry, {
        platform: 'instagram',
        success: false,
        errorCode: 'account_reauth_required',
        platformPostId: null,
        postUrl: null,
        postCaption: 'caption de prueba',
        requestId: 'req-1',
        jobId: null,
        uploadTimestamp: '2026-09-16T10:00:00.000Z',
    })
})

// ---------------------------------------------------------------------------
// isReauthRequiredBody
// ---------------------------------------------------------------------------

test('401 con code que termina en _reauth_required', () => {
    assert.equal(
        isReauthRequiredBody(401, { success: false, code: 'instagram_reauth_required' }),
        true,
    )
})

test('401 con error_code que termina en _reauth_required', () => {
    assert.equal(
        isReauthRequiredBody(401, { success: false, error_code: 'tiktok_reauth_required' }),
        true,
    )
})

test('body con reauth_required:true, sin importar el status entre los esperados', () => {
    assert.equal(isReauthRequiredBody(409, { reauth_required: true }), true)
    assert.equal(isReauthRequiredBody(400, { reauth_required: true }), true)
})

test('401 que no matchea (error genérico) devuelve false', () => {
    assert.equal(
        isReauthRequiredBody(401, { success: false, error: 'Invalid API key' }),
        false,
    )
})

test('status fuera de 400/401/409 nunca es reauth, aunque el code matchee', () => {
    assert.equal(
        isReauthRequiredBody(500, { code: 'instagram_reauth_required' }),
        false,
    )
})

// ---------------------------------------------------------------------------
// toIsoTimestamp
// ---------------------------------------------------------------------------

test('ISO pasa (normalizado a ISO con milisegundos)', () => {
    assert.equal(toIsoTimestamp('2026-09-16T12:00:00Z'), '2026-09-16T12:00:00.000Z')
})

test('epoch en SEGUNDOS como cadena (< 1e12) se interpreta en segundos', () => {
    assert.equal(toIsoTimestamp('1758000000'), '2025-09-16T05:20:00.000Z')
})

test('epoch en MILISEGUNDOS como número (>= 1e12) da el mismo instante', () => {
    assert.equal(toIsoTimestamp(1758000000000), '2025-09-16T05:20:00.000Z')
})

test('una cadena que no es fecha da null (no rompe el INSERT timestamptz)', () => {
    assert.equal(toIsoTimestamp('garbage'), null)
})

test('null entra, null sale', () => {
    assert.equal(toIsoTimestamp(null), null)
})

test('el comentario con timestamp epoch en segundos llega normalizado a ISO', () => {
    const comment = normalizeComment('instagram', {
        id: 'c-epoch',
        text: 'hola',
        timestamp: 1758000000,
        user: { id: 'u1', username: 'fan' },
    })
    assert.equal(comment?.timestamp, '2025-09-16T05:20:00.000Z')
})
