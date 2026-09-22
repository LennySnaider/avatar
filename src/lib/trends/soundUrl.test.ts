import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isPlayableSoundUrl } from './soundUrl.ts'

const NOW = Date.UTC(2026, 8, 22, 12, 0, 0)
const tiktok = (expireSec: number) =>
    `https://v16-webapp-prime.tiktok.com/video/tos/no1a/abc/?a=1988&expire=${expireSec}&l=x`

test('sin URL no hay audio', () => {
    assert.equal(isPlayableSoundUrl(null, NOW), false)
    assert.equal(isPlayableSoundUrl('', NOW), false)
    assert.equal(isPlayableSoundUrl('no-es-una-url', NOW), false)
})

test('TikTok con expire en el pasado está muerta', () => {
    assert.equal(isPlayableSoundUrl(tiktok(NOW / 1000 - 60), NOW), false)
})

test('TikTok con expire en el futuro sirve', () => {
    assert.equal(isPlayableSoundUrl(tiktok(NOW / 1000 + 3600), NOW), true)
})

test('la copia propia (sin expire) nunca caduca', () => {
    assert.equal(
        isPlayableSoundUrl('https://media.example.com/trending-sounds/7123.mp3', NOW),
        true,
    )
})

test('un expire ilegible no esconde el sonido', () => {
    assert.equal(
        isPlayableSoundUrl('https://cdn.tiktok.com/a/?expire=pronto', NOW),
        true,
    )
})
