import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shouldDraftTelegramReply } from './aiGate.ts'

const base = { aiRepliesEnabled: true, chatMode: 'auto', isCreator: false, text: 'hola', inserted: true }

test('con todo a favor, sí', () => {
    assert.equal(shouldDraftTelegramReply(base), true)
})

test('con la IA del canal apagada, no — aunque la persona esté encendida en Fanvue', () => {
    assert.equal(shouldDraftTelegramReply({ ...base, aiRepliesEnabled: false }), false)
})

test('chat en off, no', () => {
    assert.equal(shouldDraftTelegramReply({ ...base, chatMode: 'off' }), false)
})

test('chat en draft, sí (el borrador se deja para aprobar; aquí sólo se decide si se genera)', () => {
    assert.equal(shouldDraftTelegramReply({ ...base, chatMode: 'draft' }), true)
})

test('el interlocutor es un creador/bot, no', () => {
    assert.equal(shouldDraftTelegramReply({ ...base, isCreator: true }), false)
})

test('sin texto (sticker, foto sin caption), no: se ingiere pero no se draftea', () => {
    assert.equal(shouldDraftTelegramReply({ ...base, text: null }), false)
    assert.equal(shouldDraftTelegramReply({ ...base, text: '   ' }), false)
})

test('mensaje ya visto (no insertado), no: evita drafts dobles en reintentos', () => {
    assert.equal(shouldDraftTelegramReply({ ...base, inserted: false }), false)
})

test('/start cuenta como texto: es el fan abriendo la conversación', () => {
    assert.equal(shouldDraftTelegramReply({ ...base, text: '/start' }), true)
})
