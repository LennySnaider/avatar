// src/lib/social/musicDispatch.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planMusicDispatch } from './musicDispatch.ts'

/**
 * Upload-Post manda UN solo archivo por llamada, y las dos plataformas quieren
 * archivos distintos:
 *
 *   - TikTok quiere el MP4 LIMPIO + `tiktok_music_id` (pista nativa, con
 *     página de sonido y sin riesgo de muteo).
 *   - Instagram quiere el MP4 CON la música horneada, porque Upload-Post no
 *     expone todavía la Audio API de Meta.
 *
 * Dos archivos = dos llamadas. Partir cuando no hace falta es gastar una
 * publicación de más; no partir cuando hace falta es mandarle a TikTok un
 * vídeo que ya trae música y que sonaría encima de la pista nativa.
 */

const BAKED = 'https://cdn.example.com/con-musica.mp4'
const CLEAN = 'https://cdn.example.com/limpio.mp4'

test('sin pista nativa se publica como siempre: una sola llamada', () => {
    const legs = planMusicDispatch({
        platforms: ['instagram', 'tiktok'],
        videoUrl: BAKED,
        cleanVideoUrl: CLEAN,
    })
    assert.equal(legs.length, 1)
    assert.deepEqual(legs[0].platforms, ['instagram', 'tiktok'])
    assert.equal(legs[0].videoUrl, BAKED)
    assert.equal(legs[0].tiktokMusicId, undefined)
})

test('pista nativa elegida pero TikTok no está entre los destinos: se ignora', () => {
    const legs = planMusicDispatch({
        platforms: ['instagram', 'x'],
        videoUrl: BAKED,
        cleanVideoUrl: CLEAN,
        tiktokMusicId: '7123',
    })
    assert.equal(legs.length, 1)
    assert.equal(legs[0].videoUrl, BAKED)
    assert.equal(legs[0].tiktokMusicId, undefined)
})

test('sólo TikTok: una llamada, con el vídeo LIMPIO y la pista nativa', () => {
    // Si le mandáramos el horneado, sonarían las dos pistas a la vez.
    const legs = planMusicDispatch({
        platforms: ['tiktok'],
        videoUrl: BAKED,
        cleanVideoUrl: CLEAN,
        tiktokMusicId: '7123',
    })
    assert.equal(legs.length, 1)
    assert.equal(legs[0].videoUrl, CLEAN)
    assert.equal(legs[0].tiktokMusicId, '7123')
})

test('TikTok + otras con dos versiones del vídeo: SE PARTE en dos llamadas', () => {
    const legs = planMusicDispatch({
        platforms: ['instagram', 'tiktok', 'x'],
        videoUrl: BAKED,
        cleanVideoUrl: CLEAN,
        tiktokMusicId: '7123',
    })
    assert.equal(legs.length, 2)

    const tiktokLeg = legs.find((l) => l.platforms.includes('tiktok'))
    assert.deepEqual(tiktokLeg?.platforms, ['tiktok'])
    assert.equal(tiktokLeg?.videoUrl, CLEAN)
    assert.equal(tiktokLeg?.tiktokMusicId, '7123')

    const restLeg = legs.find((l) => !l.platforms.includes('tiktok'))
    assert.deepEqual(restLeg?.platforms, ['instagram', 'x'])
    assert.equal(restLeg?.videoUrl, BAKED)
    assert.equal(restLeg?.tiktokMusicId, undefined)
})

test('sin versión limpia no se parte: el vídeo ya no trae música horneada', () => {
    // No se muxeó nada, así que el mismo archivo vale para todos. TikTok lo
    // recibe con pista nativa; el resto, sin música. Partir sería gastar una
    // publicación de más para mandar dos veces el mismo archivo.
    const legs = planMusicDispatch({
        platforms: ['instagram', 'tiktok'],
        videoUrl: BAKED,
        tiktokMusicId: '7123',
    })
    assert.equal(legs.length, 1)
    assert.deepEqual(legs[0].platforms, ['instagram', 'tiktok'])
    assert.equal(legs[0].videoUrl, BAKED)
    assert.equal(legs[0].tiktokMusicId, '7123')
})

test('si la versión limpia es el mismo archivo, tampoco se parte', () => {
    const legs = planMusicDispatch({
        platforms: ['instagram', 'tiktok'],
        videoUrl: BAKED,
        cleanVideoUrl: BAKED,
        tiktokMusicId: '7123',
    })
    assert.equal(legs.length, 1)
})

test('el orden de las plataformas se respeta dentro de cada llamada', () => {
    const legs = planMusicDispatch({
        platforms: ['x', 'instagram', 'tiktok', 'threads'],
        videoUrl: BAKED,
        cleanVideoUrl: CLEAN,
        tiktokMusicId: '7123',
    })
    const restLeg = legs.find((l) => !l.platforms.includes('tiktok'))
    assert.deepEqual(restLeg?.platforms, ['x', 'instagram', 'threads'])
})

test('una lista de plataformas vacía no produce llamadas', () => {
    assert.deepEqual(planMusicDispatch({ platforms: [], videoUrl: BAKED }), [])
})
