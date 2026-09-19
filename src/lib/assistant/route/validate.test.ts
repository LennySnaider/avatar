// src/lib/assistant/route/validate.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ASSISTANT_SCREENS, parseAssistantScreen, parseChatBody } from './validate.ts'

const mensajeUsuario = {
    id: 'm1',
    role: 'user',
    parts: [{ type: 'text', text: '¿cómo va instagram?' }],
}

test('ASSISTANT_SCREENS cubre exactamente la unión AssistantScreen', () => {
    assert.deepEqual([...ASSISTANT_SCREENS], [
        'inbox',
        'social-accounts',
        'social-posts',
        'studio',
        'modules',
        'other',
    ])
})

test('parseAssistantScreen: acepta las pantallas conocidas tal cual', () => {
    for (const s of ASSISTANT_SCREENS) {
        assert.equal(parseAssistantScreen(s), s)
    }
})

test('parseAssistantScreen: lo desconocido cae a "other", nunca lanza', () => {
    for (const basura of [undefined, null, '', 'INBOX', 'dashboard', 42, {}, []]) {
        assert.equal(parseAssistantScreen(basura), 'other', `falla con ${String(basura)}`)
    }
})

test('parseChatBody: cuerpo válido mínimo', () => {
    const r = parseChatBody({ messages: [mensajeUsuario] })
    assert.equal(r.ok, true)
    if (!r.ok) return
    assert.equal(r.screen, 'other')
    assert.equal(r.threadId, undefined)
    assert.equal(r.messages.length, 1)
})

test('parseChatBody: threadId y screen viajan ya normalizados', () => {
    const r = parseChatBody({
        messages: [mensajeUsuario],
        threadId: '11111111-1111-4111-8111-111111111111',
        screen: 'inbox',
    })
    assert.equal(r.ok, true)
    if (!r.ok) return
    assert.equal(r.threadId, '11111111-1111-4111-8111-111111111111')
    assert.equal(r.screen, 'inbox')
})

test('parseChatBody: una screen que no conocemos NO es un error, es "other"', () => {
    // Que el widget invente una pantalla nueva no puede tumbar el turno: el
    // peor caso es un recorte de herramientas conservador.
    const r = parseChatBody({ messages: [mensajeUsuario], screen: 'pantalla-nueva' })
    assert.equal(r.ok, true)
    if (!r.ok) return
    assert.equal(r.screen, 'other')
})

test('parseChatBody: el cuerpo tiene que ser un objeto JSON', () => {
    for (const basura of [null, undefined, 'texto', 7, [], true]) {
        const r = parseChatBody(basura)
        assert.equal(r.ok, false, `debería rechazar ${String(basura)}`)
    }
})

test('parseChatBody: messages vacío o no-array se rechaza', () => {
    for (const basura of [undefined, null, [], 'm', {}]) {
        const r = parseChatBody({ messages: basura })
        assert.equal(r.ok, false, `debería rechazar messages=${String(basura)}`)
    }
})

test('parseChatBody: cada mensaje necesita role y parts', () => {
    assert.equal(parseChatBody({ messages: [{ role: 'user' }] }).ok, false)
    assert.equal(parseChatBody({ messages: [{ parts: [] }] }).ok, false)
    assert.equal(parseChatBody({ messages: ['hola'] }).ok, false)
})

test('parseChatBody: el ÚLTIMO mensaje tiene que ser del usuario', () => {
    // Si el último es del asistente, el turno no lo pide nadie: sería la ruta
    // hablando sola y cobrando por ello.
    const r = parseChatBody({
        messages: [mensajeUsuario, { id: 'm2', role: 'assistant', parts: [] }],
    })
    assert.equal(r.ok, false)
    if (r.ok) return
    assert.match(r.error, /usuario/i)
})

test('parseChatBody: threadId presente pero no string se rechaza', () => {
    for (const basura of [1, {}, [], '']) {
        const r = parseChatBody({ messages: [mensajeUsuario], threadId: basura })
        assert.equal(r.ok, false, `debería rechazar threadId=${String(basura)}`)
    }
})

test('parseChatBody: threadId null/undefined es "hilo nuevo", no un error', () => {
    for (const vacio of [null, undefined]) {
        const r = parseChatBody({ messages: [mensajeUsuario], threadId: vacio })
        assert.equal(r.ok, true, `debería aceptar threadId=${String(vacio)}`)
        if (!r.ok) return
        assert.equal(r.threadId, undefined)
    }
})
