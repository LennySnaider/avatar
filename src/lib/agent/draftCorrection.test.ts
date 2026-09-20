import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    DISCARD_REASONS,
    buildApprovalPatch,
    isDiscardReason,
} from './draftCorrection.ts'

test('enviar un borrador sin tocarlo no inventa una corrección', () => {
    const patch = buildApprovalPatch({
        draftText: 'ey 😏 justo pensaba en ti',
        editedText: undefined,
        existingOriginal: null,
    })
    assert.equal(patch.text, 'ey 😏 justo pensaba en ti')
    assert.equal(patch.originalText, null)
    assert.equal(patch.isCorrection, false)
})

test('editar el borrador GUARDA el texto del modelo como original', () => {
    // Éste es el par que valía oro y se destruía: lo que dijo la IA y lo que
    // el humano mandó de verdad.
    const patch = buildApprovalPatch({
        draftText: 'Hola! ¿En qué puedo ayudarte?',
        editedText: 'ey 😏 justo pensaba en ti',
        existingOriginal: null,
    })
    assert.equal(patch.text, 'ey 😏 justo pensaba en ti')
    assert.equal(patch.originalText, 'Hola! ¿En qué puedo ayudarte?')
    assert.equal(patch.isCorrection, true)
})

test('un "editado" idéntico al borrador no es una corrección', () => {
    // La UI manda el textarea siempre, lo haya tocado el humano o no. Sin esto
    // el dataset se llenaría de pares donde no se cambió nada.
    const patch = buildApprovalPatch({
        draftText: 'ey 😏 justo pensaba en ti',
        editedText: '  ey 😏 justo pensaba en ti  ',
        existingOriginal: null,
    })
    assert.equal(patch.text, 'ey 😏 justo pensaba en ti')
    assert.equal(patch.originalText, null)
    assert.equal(patch.isCorrection, false)
})

test('un original ya guardado NUNCA se pisa', () => {
    // El original es lo PRIMERO que dijo el modelo. Si el mensaje pasa por una
    // segunda edición, pisarlo convertiría la corrección anterior en el
    // "original" y el par quedaría falseado.
    const patch = buildApprovalPatch({
        draftText: 'primera corrección humana',
        editedText: 'segunda corrección humana',
        existingOriginal: 'lo que dijo el modelo',
    })
    assert.equal(patch.text, 'segunda corrección humana')
    assert.equal(patch.originalText, 'lo que dijo el modelo')
    assert.equal(patch.isCorrection, true)
})

test('un borrador vacío corregido también deja par', () => {
    const patch = buildApprovalPatch({
        draftText: null,
        editedText: 'lo que debía decir',
        existingOriginal: null,
    })
    assert.equal(patch.text, 'lo que debía decir')
    assert.equal(patch.originalText, '')
    assert.equal(patch.isCorrection, true)
})

test('los motivos de descarte fallan CERRADO ante uno desconocido', () => {
    for (const reason of DISCARD_REASONS) {
        assert.equal(isDiscardReason(reason), true)
    }
    for (const bad of ['', 'constructor', 'toString', 'inventado', null, undefined, 7]) {
        assert.equal(isDiscardReason(bad), false)
    }
})
