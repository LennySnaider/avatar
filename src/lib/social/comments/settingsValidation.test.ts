import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateSocialCommentSettingsPatch } from './settingsValidation.ts'

const NO_DM_TEXT = { aiCommentDmText: null, aiCommentDmEnabled: false }

test('patch válido: enciende respuestas, cambia el modo y guarda un botón', () => {
    const res = validateSocialCommentSettingsPatch(
        {
            aiCommentRepliesEnabled: true,
            aiCommentDefaultChatMode: 'auto',
            aiCommentDmButtons: [{ title: 'Chat with me', url: 'https://t.me/example' }],
        },
        NO_DM_TEXT,
    )
    assert.equal(res.ok, true)
    if (!res.ok) return
    assert.deepEqual(res.update, {
        ai_comment_replies_enabled: true,
        ai_comment_default_chat_mode: 'auto',
        ai_comment_dm_buttons: [{ title: 'Chat with me', url: 'https://t.me/example' }],
    })
})

test('rechaza más de 3 botones', () => {
    const res = validateSocialCommentSettingsPatch(
        {
            aiCommentDmButtons: [
                { title: 'Uno', url: 'https://example.com/1' },
                { title: 'Dos', url: 'https://example.com/2' },
                { title: 'Tres', url: 'https://example.com/3' },
                { title: 'Cuatro', url: 'https://example.com/4' },
            ],
        },
        NO_DM_TEXT,
    )
    assert.deepEqual(res, { ok: false, error: 'You can add up to 3 buttons.' })
})

test('rechaza un título de 21 caracteres', () => {
    const title21 = 'a'.repeat(21)
    assert.equal(title21.length, 21)
    const res = validateSocialCommentSettingsPatch(
        { aiCommentDmButtons: [{ title: title21, url: 'https://example.com' }] },
        NO_DM_TEXT,
    )
    assert.deepEqual(res, {
        ok: false,
        error: 'Button 1: title must be 20 characters or fewer.',
    })
})

test('acepta un título de exactamente 20 caracteres', () => {
    const title20 = 'a'.repeat(20)
    const res = validateSocialCommentSettingsPatch(
        { aiCommentDmButtons: [{ title: title20, url: 'https://example.com' }] },
        NO_DM_TEXT,
    )
    assert.equal(res.ok, true)
})

test('rechaza una URL ftp (no http/https)', () => {
    const res = validateSocialCommentSettingsPatch(
        { aiCommentDmButtons: [{ title: 'Ok', url: 'ftp://example.com' }] },
        NO_DM_TEXT,
    )
    assert.deepEqual(res, {
        ok: false,
        error: 'Button 1: URL must start with http:// or https://.',
    })
})

test('rechaza un título vacío (o sólo espacios)', () => {
    const res = validateSocialCommentSettingsPatch(
        { aiCommentDmButtons: [{ title: '   ', url: 'https://example.com' }] },
        NO_DM_TEXT,
    )
    assert.deepEqual(res, { ok: false, error: 'Button 1: title is required.' })
})

test('encender el DM sin texto (ni en el patch ni ya guardado) se rechaza', () => {
    const res = validateSocialCommentSettingsPatch({ aiCommentDmEnabled: true }, NO_DM_TEXT)
    assert.deepEqual(res, {
        ok: false,
        error: 'Write the DM text before enabling the private reply',
    })
})

test('encender el DM con texto ya guardado (no en este patch) se acepta', () => {
    const res = validateSocialCommentSettingsPatch(
        { aiCommentDmEnabled: true },
        { aiCommentDmText: 'Gracias por comentar', aiCommentDmEnabled: false },
    )
    assert.equal(res.ok, true)
    if (!res.ok) return
    assert.deepEqual(res.update, { ai_comment_dm_enabled: true })
})

test('encender el DM con texto sólo espacios ya guardado también se rechaza', () => {
    const res = validateSocialCommentSettingsPatch(
        { aiCommentDmEnabled: true },
        { aiCommentDmText: '   ', aiCommentDmEnabled: false },
    )
    assert.deepEqual(res, {
        ok: false,
        error: 'Write the DM text before enabling the private reply',
    })
})

test('encender el DM junto con el texto en el MISMO patch se acepta', () => {
    const res = validateSocialCommentSettingsPatch(
        { aiCommentDmEnabled: true, aiCommentDmText: 'Gracias!' },
        NO_DM_TEXT,
    )
    assert.equal(res.ok, true)
    if (!res.ok) return
    assert.deepEqual(res.update, { ai_comment_dm_text: 'Gracias!', ai_comment_dm_enabled: true })
})

test('apagar el DM nunca exige texto', () => {
    const res = validateSocialCommentSettingsPatch({ aiCommentDmEnabled: false }, NO_DM_TEXT)
    assert.equal(res.ok, true)
    if (!res.ok) return
    assert.deepEqual(res.update, { ai_comment_dm_enabled: false })
})

test('modo inválido se rechaza', () => {
    // @ts-expect-error probando un valor fuera de la unión a propósito
    const res = validateSocialCommentSettingsPatch({ aiCommentDefaultChatMode: 'weekly' }, NO_DM_TEXT)
    assert.deepEqual(res, { ok: false, error: 'Invalid chat mode.' })
})

test('el texto se recorta y el string vacío se guarda como null', () => {
    const res = validateSocialCommentSettingsPatch({ aiCommentDmText: '   ' }, NO_DM_TEXT)
    assert.equal(res.ok, true)
    if (!res.ok) return
    assert.deepEqual(res.update, { ai_comment_dm_text: null })

    const res2 = validateSocialCommentSettingsPatch({ aiCommentDmText: '  Hola  ' }, NO_DM_TEXT)
    assert.equal(res2.ok, true)
    if (!res2.ok) return
    assert.deepEqual(res2.update, { ai_comment_dm_text: 'Hola' })
})

test('poner el texto en null explícito se guarda como null (DM ya apagado)', () => {
    const res = validateSocialCommentSettingsPatch(
        { aiCommentDmText: null },
        { aiCommentDmText: 'texto viejo', aiCommentDmEnabled: false },
    )
    assert.equal(res.ok, true)
    if (!res.ok) return
    assert.deepEqual(res.update, { ai_comment_dm_text: null })
})

test('patch vacío no actualiza nada y no falla', () => {
    const res = validateSocialCommentSettingsPatch({}, NO_DM_TEXT)
    assert.deepEqual(res, { ok: true, update: {} })
})

test('los botones se recortan (trim) antes de guardarse', () => {
    const res = validateSocialCommentSettingsPatch(
        { aiCommentDmButtons: [{ title: '  Chat  ', url: '  https://t.me/x  ' }] },
        NO_DM_TEXT,
    )
    assert.equal(res.ok, true)
    if (!res.ok) return
    assert.deepEqual(res.update.ai_comment_dm_buttons, [{ title: 'Chat', url: 'https://t.me/x' }])
})

// --- Ronda 2 de revisión: el DM ya encendido (de antes) + "Save DM" con la
// textarea en blanco dejaba `ai_comment_dm_enabled=true` con
// `ai_comment_dm_text=null` porque el patch de "Save DM" nunca toca
// `aiCommentDmEnabled` — el invariante sólo se chequeaba cuando el switch
// SÍ venía en el patch. Ahora se calcula sobre el estado RESULTANTE
// (heredando lo guardado cuando el patch no lo toca).

test('DM ya encendido + "Save DM" con texto en blanco (el patch no toca el switch) se rechaza', () => {
    const res = validateSocialCommentSettingsPatch(
        { aiCommentDmText: '', aiCommentDmButtons: [] },
        { aiCommentDmText: 'Gracias por comentar', aiCommentDmEnabled: true },
    )
    assert.deepEqual(res, {
        ok: false,
        error: 'Disable the private reply before removing the DM text',
    })
})

test('DM ya encendido + apagarlo Y vaciar el texto en el MISMO patch se acepta', () => {
    const res = validateSocialCommentSettingsPatch(
        { aiCommentDmEnabled: false, aiCommentDmText: '' },
        { aiCommentDmText: 'Gracias por comentar', aiCommentDmEnabled: true },
    )
    assert.equal(res.ok, true)
    if (!res.ok) return
    assert.deepEqual(res.update, { ai_comment_dm_enabled: false, ai_comment_dm_text: null })
})

test('DM ya apagado + texto en blanco se acepta (no hay nada encendido que exija texto)', () => {
    const res = validateSocialCommentSettingsPatch(
        { aiCommentDmText: '' },
        { aiCommentDmText: null, aiCommentDmEnabled: false },
    )
    assert.equal(res.ok, true)
    if (!res.ok) return
    assert.deepEqual(res.update, { ai_comment_dm_text: null })
})
