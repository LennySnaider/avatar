// src/lib/ai/kieChatPayload.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toKieChatBody } from './kieChatPayload.ts'

const textPart = (text: string) => ({ text })
const imgPart = (data: string, mimeType = 'image/jpeg') => ({
    inlineData: { mimeType, data },
})

test('texto suelto → un content de tipo text', () => {
    const body = toKieChatBody({ parts: [textPart('describe this')] })
    assert.equal(body.model, 'gemini-2.5-flash')
    assert.equal(body.stream, false)
    assert.deepEqual(body.messages, [
        { role: 'user', content: [{ type: 'text', text: 'describe this' }] },
    ])
})

test('imagen inline → data: URI con su mimeType', () => {
    const body = toKieChatBody({
        parts: [imgPart('QUJD', 'image/png'), textPart('what is this')],
    })
    const content = body.messages[0].content as Array<Record<string, unknown>>
    assert.equal(content.length, 2)
    assert.deepEqual(content[0], {
        type: 'image_url',
        image_url: { url: 'data:image/png;base64,QUJD' },
    })
    assert.deepEqual(content[1], { type: 'text', text: 'what is this' })
})

test('el base64 que ya viene como data: URI no se envuelve dos veces', () => {
    const body = toKieChatBody({
        parts: [imgPart('data:image/jpeg;base64,QUJD')],
    })
    const content = body.messages[0].content as Array<{
        image_url?: { url: string }
    }>
    assert.equal(content[0].image_url?.url, 'data:image/jpeg;base64,QUJD')
})

test('multi-imagen conserva el ORDEN (analyzeFaceFromImages manda varias)', () => {
    const body = toKieChatBody({
        parts: [imgPart('AAA'), imgPart('BBB'), textPart('compare')],
    })
    const content = body.messages[0].content as Array<{
        image_url?: { url: string }
        text?: string
    }>
    assert.match(content[0].image_url!.url, /AAA$/)
    assert.match(content[1].image_url!.url, /BBB$/)
    assert.equal(content[2].text, 'compare')
})

test('responseSchema de Gemini (tipos en MAYÚSCULA) → json_schema en minúscula', () => {
    const body = toKieChatBody({
        parts: [textPart('caption please')],
        responseSchema: {
            type: 'OBJECT',
            properties: {
                caption: { type: 'STRING' },
                hashtags: { type: 'ARRAY', items: { type: 'STRING' } },
            },
            required: ['caption', 'hashtags'],
        },
    })
    const schema = body.response_format?.json_schema.schema as {
        type: string
        properties: Record<string, { type: string; items?: { type: string } }>
        required: string[]
    }
    assert.equal(body.response_format?.type, 'json_schema')
    assert.equal(schema.type, 'object')
    assert.equal(schema.properties.caption.type, 'string')
    assert.equal(schema.properties.hashtags.type, 'array')
    // Anidado: el items también baja a minúscula
    assert.equal(schema.properties.hashtags.items?.type, 'string')
    assert.deepEqual(schema.required, ['caption', 'hashtags'])
})

test('sin responseSchema NO se manda response_format', () => {
    const body = toKieChatBody({ parts: [textPart('hola')] })
    assert.equal(body.response_format, undefined)
})

test('varias partes de texto se concatenan en orden', () => {
    const body = toKieChatBody({ parts: [textPart('uno'), textPart('dos')] })
    const content = body.messages[0].content as Array<{ text?: string }>
    assert.equal(content[0].text, 'uno')
    assert.equal(content[1].text, 'dos')
})
