// src/lib/social/tiktokPhotoText.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    buildTikTokPhotoText,
    TIKTOK_PHOTO_TITLE_MAX,
    TIKTOK_PHOTO_DESCRIPTION_MAX,
} from './tiktokPhotoText.ts'

/**
 * El 400 que esto impide repetir (PostModal, 2026-09-19): "TikTok title is
 * too long (178 characters, counted the way TikTok does: an emoji counts as
 * 2). Maximum allowed is 90." Mandábamos caption + hashtags como `title` a
 * todas las redes; para FOTOS TikTok limita el título a 90 y la descripción a
 * 4000, ambos en "UTF-16 runes" (doc oficial: content-posting-api-reference-
 * photo-post). `String.length` en JS cuenta exactamente eso.
 */
const caption =
    'Aquí, absorbiendo cada rayo de sol. Estos momentos son pura felicidad. ¿Cuál es tu lugar favorito para desconectar? 🌟'
const hashtags = [
    'playa',
    'vacaciones',
    'bikini',
    'paraiso',
    'buenavida',
    'fotodeldia',
]

test('el caso real: título ≤ 90 unidades UTF-16, descripción con los hashtags', () => {
    const { title, description } = buildTikTokPhotoText(caption, hashtags)
    assert.ok(title.length <= TIKTOK_PHOTO_TITLE_MAX, `title ${title.length}`)
    assert.ok(!title.includes('#'), 'los hashtags NO van en el título')
    assert.ok(
        description.startsWith(caption),
        'la descripción lleva el caption entero',
    )
    assert.ok(
        description.endsWith(
            '#playa #vacaciones #bikini #paraiso #buenavida #fotodeldia',
        ),
    )
})

test('el título se corta en un límite de palabra y termina en …', () => {
    const { title } = buildTikTokPhotoText(caption, [])
    assert.ok(title.endsWith('…'))
    assert.ok(!title.endsWith(' …'), 'sin espacio antes de la elipsis')
    // Corte en palabra: la última palabra del título existe entera en el caption.
    const lastWord = title.slice(0, -1).split(' ').pop()!
    assert.ok(caption.includes(`${lastWord} `))
})

test('un emoji cuenta 2: 45 emojis caben, 46 no', () => {
    const ok = '🌟'.repeat(45) // 90 unidades
    assert.equal(buildTikTokPhotoText(ok, []).title, ok)
    const over = '🌟'.repeat(46) // 92 unidades
    const { title } = buildTikTokPhotoText(over, [])
    assert.ok(title.length <= TIKTOK_PHOTO_TITLE_MAX)
    // Nunca se parte un par sustituto (saldría un carácter roto U+FFFD al render).
    assert.ok(!/[\uD800-\uDBFF]$/.test(title.slice(0, -1)))
})

test('un caption corto viaja intacto como título', () => {
    const { title, description } = buildTikTokPhotoText('Hola playa 🌊', [
        'playa',
    ])
    assert.equal(title, 'Hola playa 🌊')
    assert.equal(description, 'Hola playa 🌊\n\n#playa')
})

test('sin hashtags la descripción es el caption tal cual', () => {
    assert.equal(
        buildTikTokPhotoText('Solo texto', []).description,
        'Solo texto',
    )
})

test('la descripción también se acota a su tope', () => {
    const long = 'a'.repeat(TIKTOK_PHOTO_DESCRIPTION_MAX + 50)
    const { description } = buildTikTokPhotoText(long, ['x'])
    assert.ok(description.length <= TIKTOK_PHOTO_DESCRIPTION_MAX)
})
