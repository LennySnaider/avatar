// src/lib/social/providers/UploadPostProvider.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildVideoUploadForm } from './uploadPostForm.ts'

/**
 * Por qué existen estos tests: en Upload-Post conviven DOS convenciones de
 * nombre y elegir la equivocada no da error, da silencio.
 *
 *   - Los overrides por plataforma viajan como `${plataforma}_${clave}`
 *     (`tiktok_title`), que es lo que arma `buildPublishForm`.
 *   - Pero `audio_name` —la etiqueta de la pista embebida en un Reel— es un
 *     campo TOP-LEVEL del cuerpo. Mandado como `instagram_audio_name` sería un
 *     campo inexistente: la API lo IGNORA, el post sale publicado y sin
 *     etiqueta, y nadie se entera de que la feature no funciona.
 *
 * Verificado contra el OpenAPI de Upload-Post (`POST /api/upload`).
 */

const baseParams = {
    username: 'mia',
    caption: 'hola',
    platforms: [{ platform: 'instagram' as const }],
    videoUrl: 'https://cdn.example.com/v.mp4',
}

test('audio_name viaja SIN prefijo de plataforma', () => {
    const fd = buildVideoUploadForm({ ...baseParams, audioName: 'Blinding Lights · The Weeknd' })
    assert.equal(fd.get('audio_name'), 'Blinding Lights · The Weeknd')
})

test('audio_name NUNCA viaja prefijado: la API lo ignoraría en silencio', () => {
    const fd = buildVideoUploadForm({ ...baseParams, audioName: 'Blinding Lights' })
    assert.equal(fd.get('instagram_audio_name'), null)
})

test('sin pista elegida, el campo no viaja en absoluto', () => {
    const fd = buildVideoUploadForm(baseParams)
    assert.equal(fd.get('audio_name'), null)
})

test('los overrides por plataforma SÍ se prefijan: es la otra convención', () => {
    // Guardia de regresión: si alguien "uniformara" audio_name metiéndolo por
    // params, este test seguiría verde y el de arriba se pondría rojo.
    const fd = buildVideoUploadForm({
        ...baseParams,
        platforms: [{ platform: 'tiktok' as const, params: { title: 'Mi título' } }],
    })
    assert.equal(fd.get('tiktok_title'), 'Mi título')
})

test('el video y la portada viajan con sus nombres de siempre', () => {
    const fd = buildVideoUploadForm({
        ...baseParams,
        coverUrl: 'https://cdn.example.com/c.jpg',
    })
    assert.equal(fd.get('video'), 'https://cdn.example.com/v.mp4')
    assert.equal(fd.get('cover_url'), 'https://cdn.example.com/c.jpg')
})
