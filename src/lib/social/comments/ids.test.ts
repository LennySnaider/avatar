import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    commenterIdFromChat,
    encodeCommentChatId,
    isSocialCommentPlatform,
    platformFromChat,
    postIdFromChat,
    toSocialChatPlatform,
} from './ids.ts'

test('toSocialChatPlatform antepone el prefijo social:', () => {
    assert.equal(toSocialChatPlatform('instagram'), 'social:instagram')
    assert.equal(toSocialChatPlatform('x'), 'social:x')
})

test('isSocialCommentPlatform distingue por el prefijo social:', () => {
    assert.equal(isSocialCommentPlatform('social:instagram'), true)
    assert.equal(isSocialCommentPlatform('social:x'), true)
    assert.equal(isSocialCommentPlatform('fanvue'), false)
    assert.equal(isSocialCommentPlatform('telegram'), false)
    assert.equal(isSocialCommentPlatform(''), false)
})

test('platformFromChat extrae la red de un platform social:*', () => {
    assert.equal(platformFromChat('social:x'), 'x')
    assert.equal(platformFromChat('social:instagram'), 'instagram')
})

test('platformFromChat devuelve null para lo que no es social:*', () => {
    assert.equal(platformFromChat('fanvue'), null)
    assert.equal(platformFromChat('telegram'), null)
    assert.equal(platformFromChat(''), null)
})

test('encodeCommentChatId + commenterIdFromChat/postIdFromChat hacen round-trip', () => {
    const chatId = encodeCommentChatId('post123', 'fan456')
    assert.equal(chatId, 'post123:fan456')
    assert.equal(postIdFromChat(chatId), 'post123')
    assert.equal(commenterIdFromChat(chatId), 'fan456')
})

test('el round-trip sobrevive aunque el commenterId traiga sus propios ":"', () => {
    const chatId = encodeCommentChatId('post123', 'urn:li:person:999')
    assert.equal(chatId, 'post123:urn:li:person:999')
    assert.equal(postIdFromChat(chatId), 'post123')
    assert.equal(commenterIdFromChat(chatId), 'urn:li:person:999')
})

test('encodeCommentChatId revienta si el postId trae ":" (URNs tipo LinkedIn, fuera de alcance v1)', () => {
    assert.throws(() => encodeCommentChatId('urn:li:ugcPost:123', 'fan456'))
})

test('commenterIdFromChat es identidad cuando no hay ":" (ids de Fanvue/Telegram)', () => {
    assert.equal(commenterIdFromChat('fan456'), 'fan456')
    assert.equal(commenterIdFromChat(''), '')
})

test('postIdFromChat devuelve null cuando no hay ":"', () => {
    assert.equal(postIdFromChat('fan456'), null)
    assert.equal(postIdFromChat(''), null)
})
