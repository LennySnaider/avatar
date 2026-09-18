import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toSocialCommentSettings } from './settings.ts'
import type { SocialProfileRow } from '../../agent/db.ts'

function baseRow(overrides: Partial<SocialProfileRow> = {}): SocialProfileRow {
    return {
        id: 'profile-1',
        organization_id: 'org-1',
        avatar_id: 'avatar-1',
        status: 'active',
        upload_post_username: 'mia-abc123',
        connected_platforms: [],
        ai_comment_replies_enabled: true,
        ai_comment_default_chat_mode: 'draft',
        ai_comment_dm_enabled: false,
        ai_comment_dm_text: null,
        ai_comment_dm_buttons: [],
        ...overrides,
    }
}

test('toSocialCommentSettings: mapea los campos básicos y no expone nada que huela a credencial', () => {
    const dto = toSocialCommentSettings(baseRow())
    assert.equal(dto.profileId, 'profile-1')
    assert.equal(dto.avatarId, 'avatar-1')
    assert.equal(dto.organizationId, 'org-1')
    assert.equal(dto.uploadPostUsername, 'mia-abc123')
    assert.equal(dto.aiRepliesEnabled, true)
    assert.equal(dto.aiDefaultChatMode, 'draft')
    assert.equal(dto.dmEnabled, false)
    assert.equal(dto.dmText, null)
    assert.deepEqual(dto.ownAccounts, [])
    assert.equal('api_key' in dto, false)
    assert.equal((dto as unknown as { apiKey?: unknown }).apiKey, undefined)
})

test('toSocialCommentSettings: aiDefaultChatMode cae a "draft" para cualquier valor que no sea "auto"', () => {
    assert.equal(toSocialCommentSettings(baseRow({ ai_comment_default_chat_mode: 'auto' })).aiDefaultChatMode, 'auto')
    assert.equal(toSocialCommentSettings(baseRow({ ai_comment_default_chat_mode: 'draft' })).aiDefaultChatMode, 'draft')
    assert.equal(
        toSocialCommentSettings(baseRow({ ai_comment_default_chat_mode: 'algo-raro' })).aiDefaultChatMode,
        'draft',
    )
})

test('toSocialCommentSettings: avatarId vacío cuando avatar_id es null', () => {
    assert.equal(toSocialCommentSettings(baseRow({ avatar_id: null })).avatarId, '')
})

test('toSocialCommentSettings: dmButtons viaja crudo tal cual (jsonb libre, sanitizeDmButtons lo sanea después)', () => {
    const raw = [{ title: 'x', url: 'y' }, 'basura']
    const dto = toSocialCommentSettings(baseRow({ ai_comment_dm_buttons: raw }))
    assert.deepEqual(dto.dmButtons, raw)
})

test('toSocialCommentSettings: connected_platforms bien formado se mapea a ownAccounts', () => {
    const raw = [
        { platform: 'instagram', accountId: 'ig-1', accountName: 'mi_avatar', connectedAt: '2026-01-01T00:00:00Z' },
        { platform: 'x', accountId: 'x-1', accountName: 'mi_avatar_x' },
    ]
    const dto = toSocialCommentSettings(baseRow({ connected_platforms: raw }))
    assert.deepEqual(dto.ownAccounts, [
        { platform: 'instagram', accountId: 'ig-1', accountName: 'mi_avatar' },
        { platform: 'x', accountId: 'x-1', accountName: 'mi_avatar_x' },
    ])
})

test('toSocialCommentSettings: connected_platforms malformado se descarta sin tirar', () => {
    assert.deepEqual(toSocialCommentSettings(baseRow({ connected_platforms: null })).ownAccounts, [])
    assert.deepEqual(toSocialCommentSettings(baseRow({ connected_platforms: 'not-an-array' })).ownAccounts, [])
    assert.deepEqual(toSocialCommentSettings(baseRow({ connected_platforms: {} })).ownAccounts, [])
})

test('toSocialCommentSettings: entradas de connected_platforms sin platform (o vacío) se descartan una por una', () => {
    const raw = [
        { accountId: 'no-platform' },
        { platform: '', accountId: 'empty-platform' },
        null,
        'string-suelto',
        42,
        { platform: 'instagram', accountId: 'ig-2', accountName: 'ok' },
    ]
    const dto = toSocialCommentSettings(baseRow({ connected_platforms: raw }))
    assert.deepEqual(dto.ownAccounts, [{ platform: 'instagram', accountId: 'ig-2', accountName: 'ok' }])
})

test('toSocialCommentSettings: accountId/accountName ausentes o no-string caen a cadena vacía', () => {
    const raw = [{ platform: 'tiktok', accountId: 123, accountName: null }]
    const dto = toSocialCommentSettings(baseRow({ connected_platforms: raw }))
    assert.deepEqual(dto.ownAccounts, [{ platform: 'tiktok', accountId: '', accountName: '' }])
})
