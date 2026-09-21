// src/lib/social/groupSplitPosts.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupSplitPosts } from './groupSplitPosts.ts'

/**
 * Un post con música puede haberse publicado en DOS llamadas (el MP4 limpio a
 * TikTok con pista nativa, el horneado al resto), y eso son dos filas de
 * social_posts unidas por post_group_id. Para el usuario fue UN post, así que
 * la lista las junta.
 *
 * Lo que más importa aquí es el estado: si una de las dos llamadas falló, la
 * tarjeta NO puede decir "published". Esa mentira por plataforma es justo la
 * razón por la que existe social_post_targets.
 */

const row = (over: Partial<Parameters<typeof groupSplitPosts>[0][number]> = {}) => ({
    id: 'a',
    post_group_id: null,
    platforms: ['instagram'],
    status: 'published',
    created_at: '2026-09-20T10:00:00Z',
    ...over,
})

test('los posts normales pasan intactos y en orden', () => {
    const out = groupSplitPosts([row({ id: 'a' }), row({ id: 'b' })])
    assert.equal(out.length, 2)
    assert.deepEqual(out.map((r) => r.id), ['a', 'b'])
})

test('dos filas del mismo grupo se pintan como UNA tarjeta', () => {
    const out = groupSplitPosts([
        row({ id: 'a', post_group_id: 'g1', platforms: ['instagram'] }),
        row({ id: 'b', post_group_id: 'g1', platforms: ['tiktok'] }),
    ])
    assert.equal(out.length, 1)
})

test('la tarjeta agrupada muestra TODAS las plataformas del post', () => {
    const out = groupSplitPosts([
        row({ id: 'a', post_group_id: 'g1', platforms: ['instagram', 'x'] }),
        row({ id: 'b', post_group_id: 'g1', platforms: ['tiktok'] }),
    ])
    assert.deepEqual(out[0].platforms, ['instagram', 'x', 'tiktok'])
})

test('si una llamada falló, la tarjeta NO dice published', () => {
    // Decir "publicado" cuando media publicación se cayó es la mentira que
    // hay que evitar.
    const out = groupSplitPosts([
        row({ id: 'a', post_group_id: 'g1', status: 'published' }),
        row({ id: 'b', post_group_id: 'g1', status: 'failed' }),
    ])
    assert.equal(out[0].status, 'failed')
})

test('mientras una siga en curso, el grupo sigue en curso', () => {
    const out = groupSplitPosts([
        row({ id: 'a', post_group_id: 'g1', status: 'published' }),
        row({ id: 'b', post_group_id: 'g1', status: 'processing' }),
    ])
    assert.equal(out[0].status, 'processing')
})

test('con las dos publicadas, el grupo está publicado', () => {
    const out = groupSplitPosts([
        row({ id: 'a', post_group_id: 'g1', status: 'published' }),
        row({ id: 'b', post_group_id: 'g1', status: 'published' }),
    ])
    assert.equal(out[0].status, 'published')
})

test('el grupo ocupa el sitio de su primera fila, no salta al final', () => {
    const out = groupSplitPosts([
        row({ id: 'a', post_group_id: 'g1' }),
        row({ id: 'b' }),
        row({ id: 'c', post_group_id: 'g1' }),
    ])
    assert.deepEqual(out.map((r) => r.id), ['a', 'b'])
})

test('grupos distintos no se mezclan', () => {
    const out = groupSplitPosts([
        row({ id: 'a', post_group_id: 'g1' }),
        row({ id: 'b', post_group_id: 'g2' }),
    ])
    assert.equal(out.length, 2)
})

test('una plataforma repetida en las dos filas no se duplica en la tarjeta', () => {
    const out = groupSplitPosts([
        row({ id: 'a', post_group_id: 'g1', platforms: ['tiktok'] }),
        row({ id: 'b', post_group_id: 'g1', platforms: ['tiktok'] }),
    ])
    assert.deepEqual(out[0].platforms, ['tiktok'])
})

test('una lista vacía no revienta', () => {
    assert.deepEqual(groupSplitPosts([]), [])
})
