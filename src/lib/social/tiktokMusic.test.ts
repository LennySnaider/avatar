// src/lib/social/tiktokMusic.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    normalizeTikTokMusicTrack,
    buildTikTokMusicQuery,
    TIKTOK_MUSIC_DATE_RANGES,
} from './tiktokMusic.ts'

/**
 * La Commercial Music Library de TikTok, servida por Upload-Post. Aquí hay una
 * trampa documentada por el propio proveedor: cada track trae DOS ids y sólo
 * uno sirve. Pasar `commercial_music_id` hace que TikTok RECHACE el post
 * público — el campo correcto es `id`.
 */

const rawTrack = {
    id: '7123456789',
    commercial_music_id: 'cml-no-usar',
    title: 'Blinding Lights',
    artist: 'The Weeknd',
    duration: 200,
    rank: 1,
    genres: ['POP'],
    cover_url: 'https://cdn.tiktok.com/cover.jpg',
    preview_url: 'https://cdn.tiktok.com/preview.mp3',
}

test('el id adjuntable es `id`, NUNCA `commercial_music_id`', () => {
    // TikTok rechaza el post público si se manda el commercial_music_id.
    const track = normalizeTikTokMusicTrack(rawTrack)
    assert.equal(track?.id, '7123456789')
})

test('el commercial_music_id no sobrevive a la normalización', () => {
    // Si no está en el DTO, nadie puede mandarlo por error más adelante.
    const track = normalizeTikTokMusicTrack(rawTrack)
    assert.equal('commercialMusicId' in (track as object), false)
})

test('los datos de la ficha llegan a la UI', () => {
    const track = normalizeTikTokMusicTrack(rawTrack)
    assert.equal(track?.title, 'Blinding Lights')
    assert.equal(track?.artist, 'The Weeknd')
    assert.equal(track?.previewUrl, 'https://cdn.tiktok.com/preview.mp3')
    assert.equal(track?.coverUrl, 'https://cdn.tiktok.com/cover.jpg')
})

test('un track sin id no sirve para nada: se descarta', () => {
    assert.equal(normalizeTikTokMusicTrack({ title: 'Sin id' }), null)
})

test('un track sin título no se puede mostrar: se descarta', () => {
    assert.equal(normalizeTikTokMusicTrack({ id: '7' }), null)
})

test('basura en la respuesta no revienta la lista', () => {
    assert.equal(normalizeTikTokMusicTrack(null), null)
    assert.equal(normalizeTikTokMusicTrack('texto'), null)
})

test('los campos opcionales que falten quedan en null, no undefined', () => {
    const track = normalizeTikTokMusicTrack({ id: '7', title: 'Mínimo' })
    assert.equal(track?.artist, null)
    assert.equal(track?.previewUrl, null)
    assert.equal(track?.duration, null)
})

test('la consulta lleva los defaults del proveedor cuando no se elige nada', () => {
    const q = buildTikTokMusicQuery({ profile: 'mia' })
    assert.equal(q.profile, 'mia')
    assert.equal(q.genre, 'ALL')
    assert.equal(q.country_code, 'US')
    assert.equal(q.date_range, '7DAY')
})

test('lo que se elige manda sobre el default', () => {
    const q = buildTikTokMusicQuery({
        profile: 'mia',
        countryCode: 'MX',
        dateRange: '30DAY',
        genre: 'LATIN',
    })
    assert.equal(q.country_code, 'MX')
    assert.equal(q.date_range, '30DAY')
    assert.equal(q.genre, 'LATIN')
})

test('un rango inventado cae al default en vez de irse a la API', () => {
    const q = buildTikTokMusicQuery({ profile: 'mia', dateRange: '5DAY' as never })
    assert.equal(q.date_range, '7DAY')
    assert.ok(TIKTOK_MUSIC_DATE_RANGES.includes('90DAY'))
})
