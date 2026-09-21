// exportProvenance.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildExportProvenance } from './exportProvenance.ts'

/**
 * El bug que motiva todo esto: "Save to gallery" metía el blob: en Zustand y
 * ya. Sin fila en `generations` no se puede publicar, y el blob moría al
 * cerrar la pestaña. Al persistir de verdad hay que decidir DE QUIÉN es el
 * video resultante, y ahí hay dos reglas que no son obvias.
 */

test('el avatar sale del primer clip que tenga uno', () => {
    const { avatarId } = buildExportProvenance([
        { avatarId: null },
        { avatarId: 'mia' },
        { avatarId: 'otra' },
    ])
    assert.equal(avatarId, 'mia')
})

test('sin ningún avatar el export nace huérfano, no inventa uno', () => {
    // Clips subidos de disco: la fila se crea igual y el PostModal ya avisa
    // de que hace falta avatar para publicar.
    const { avatarId } = buildExportProvenance([{}, { avatarId: null }])
    assert.equal(avatarId, null)
})

test('con UN clip, muxedFrom apunta a la generación original', () => {
    // Es lo que hace que el item ORIGINAL de la galería también salga como
    // "Posted" (getPostedGenerationMap ya lo lee) y, en la Fase 2, lo que
    // permite recuperar el video limpio para TikTok.
    const { metadata } = buildExportProvenance([{ avatarId: 'mia', sourceGenerationId: 'gen-1' }])
    assert.equal(metadata.muxedFrom, 'gen-1')
})

test('con VARIOS clips NO hay muxedFrom: re-atribuir a uno sería mentir', () => {
    // Un video unido de 3 clips no "es" el primero: marcar ese como publicado
    // señalaría como posteado algo que sólo aportó un trozo.
    const { metadata } = buildExportProvenance([
        { avatarId: 'mia', sourceGenerationId: 'gen-1' },
        { avatarId: 'mia', sourceGenerationId: 'gen-2' },
    ])
    assert.equal(metadata.muxedFrom, undefined)
})

test('un clip subido de disco no tiene origen que re-atribuir', () => {
    const { metadata } = buildExportProvenance([{ avatarId: 'mia' }])
    assert.equal(metadata.muxedFrom, undefined)
})

test('la pista elegida queda en metadata para la etiqueta de Instagram', () => {
    const { metadata } = buildExportProvenance([{ avatarId: 'mia' }], {
        name: 'Blinding Lights',
        author: 'The Weeknd',
        trackId: '7abc',
        source: 'tiktok-cml',
    })
    assert.deepEqual(metadata.audio, {
        name: 'Blinding Lights',
        author: 'The Weeknd',
        trackId: '7abc',
        source: 'tiktok-cml',
    })
})

test('sin música no se escribe la clave audio', () => {
    const { metadata } = buildExportProvenance([{ avatarId: 'mia' }])
    assert.equal('audio' in metadata, false)
})

test('una pista sin nombre no se guarda: no serviría de etiqueta', () => {
    const { metadata } = buildExportProvenance([{ avatarId: 'mia' }], { source: 'upload' })
    assert.equal('audio' in metadata, false)
})

test('el export queda marcado como del editor, para poder rastrearlo', () => {
    const { metadata } = buildExportProvenance([{ avatarId: 'mia' }])
    assert.equal(metadata.source, 'video-editor')
})

test('sin clips no hay nada que exportar', () => {
    const { avatarId, metadata } = buildExportProvenance([])
    assert.equal(avatarId, null)
    assert.equal(metadata.muxedFrom, undefined)
})
