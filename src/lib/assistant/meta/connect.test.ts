// src/lib/assistant/meta/connect.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ConsentRequiredError } from '@vercel/connect/ai-sdk'
import {
    DEFAULT_META_SCOPES,
    isMetaConsentRequired,
    metaConsentUrl,
    parseScopes,
} from './connect.ts'

const reto = {
    connector: 'mcp.facebook.com/estratega',
    subject: { type: 'user', id: 'u1' } as const,
    url: 'https://connect.vercel.com/consent/abc',
    request: 'req_1',
    verifier: 'ver_1',
}

test('los 7 permisos por defecto son los que la app de Meta tiene dados de alta', () => {
    assert.deepEqual(DEFAULT_META_SCOPES, [
        'ads_mcp_management',
        'ads_read',
        'ads_management',
        'catalog_management',
        'business_management',
        'pages_show_list',
        'instagram_basic',
    ])
})

test('parseScopes: sin env, los de por defecto', () => {
    assert.deepEqual(parseScopes(undefined), DEFAULT_META_SCOPES)
    assert.deepEqual(parseScopes(''), DEFAULT_META_SCOPES)
    assert.deepEqual(parseScopes('   '), DEFAULT_META_SCOPES)
    assert.deepEqual(parseScopes(' , , '), DEFAULT_META_SCOPES)
})

test('parseScopes: separa por comas, recorta espacios y tira los vacíos', () => {
    assert.deepEqual(parseScopes('ads_read, business_management ,,'), [
        'ads_read',
        'business_management',
    ])
})

test('isMetaConsentRequired reconoce el error de consentimiento y su URL', () => {
    const err = new ConsentRequiredError(reto)
    assert.equal(isMetaConsentRequired(err), true)
    assert.equal(metaConsentUrl(err), reto.url)
})

test('isMetaConsentRequired lo encuentra aunque venga envuelto (cadena de causes)', () => {
    const envuelto = new Error('MCP connection failed', {
        cause: new ConsentRequiredError(reto),
    })
    assert.equal(isMetaConsentRequired(envuelto), true)
    assert.equal(metaConsentUrl(envuelto), reto.url)
})

test('un error cualquiera NO se confunde con falta de consentimiento', () => {
    const err = new Error('graph 500')
    assert.equal(isMetaConsentRequired(err), false)
    assert.equal(metaConsentUrl(err), null)
    assert.equal(isMetaConsentRequired(null), false)
    assert.equal(isMetaConsentRequired('ConsentRequiredError'), false)
})
