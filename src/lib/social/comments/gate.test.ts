import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shouldDraftCommentReply } from './gate.ts'

const base = { aiRepliesEnabled: true, inserted: true, isOwnComment: false, chatMode: 'auto', text: 'qué belleza' }

test('con todo a favor, sí', () => {
    assert.equal(shouldDraftCommentReply(base), true)
})

test('con la IA de comentarios apagada, no — aunque la persona esté encendida en Fanvue', () => {
    assert.equal(shouldDraftCommentReply({ ...base, aiRepliesEnabled: false }), false)
})

test('comentario ya visto (no insertado), no: evita drafts dobles entre rondas de polling', () => {
    assert.equal(shouldDraftCommentReply({ ...base, inserted: false }), false)
})

test('el comentario es del propio avatar/creador, no: no se contesta a uno mismo', () => {
    assert.equal(shouldDraftCommentReply({ ...base, isOwnComment: true }), false)
})

test('chat en off, no', () => {
    assert.equal(shouldDraftCommentReply({ ...base, chatMode: 'off' }), false)
})

test('chat en draft, sí (el borrador se deja para aprobar; aquí sólo se decide si se genera)', () => {
    assert.equal(shouldDraftCommentReply({ ...base, chatMode: 'draft' }), true)
})

test('sin texto, no: se ingiere pero no se draftea', () => {
    assert.equal(shouldDraftCommentReply({ ...base, text: null }), false)
    assert.equal(shouldDraftCommentReply({ ...base, text: '   ' }), false)
})
