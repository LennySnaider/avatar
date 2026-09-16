import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toChatListItem } from './chatListItem.ts'

const baseRow = {
    id: 'chat1',
    avatar_id: 'avatar1',
    fan_display_name: 'Fan Name',
    fan_handle: 'fanhandle',
    fan_avatar_url: null,
    mode: 'draft' as const,
    is_creator: false,
    needs_attention: false,
    attention_reason: null,
    last_message_at: '2026-09-01T00:00:00Z',
    context: null,
}

const extras = { lastMessagePreview: 'hola', hasDraft: true }

test('fila de fanvue: channel fanvue y context siempre null', () => {
    const item = toChatListItem(
        { ...baseRow, platform: 'fanvue' },
        'Avatar One',
        extras,
    )
    assert.equal(item.channel, 'fanvue')
    assert.equal(item.socialPlatform, null)
    assert.equal(item.context, null)
})

test('fila de telegram: channel telegram y context null', () => {
    const item = toChatListItem(
        { ...baseRow, platform: 'telegram' },
        'Avatar One',
        extras,
    )
    assert.equal(item.channel, 'telegram')
    assert.equal(item.socialPlatform, null)
    assert.equal(item.context, null)
})

test('fila social:x con context: channel social_comment, socialPlatform x, context parseado', () => {
    const item = toChatListItem(
        {
            ...baseRow,
            platform: 'social:x',
            context: {
                socialPostTargetId: 'target1',
                platformPostId: 'post123',
                postUrl: 'https://x.com/post/123',
                caption: 'mira este post',
            },
        },
        'Avatar One',
        extras,
    )
    assert.equal(item.channel, 'social_comment')
    assert.equal(item.socialPlatform, 'x')
    assert.deepEqual(item.context, {
        platformPostId: 'post123',
        postUrl: 'https://x.com/post/123',
        caption: 'mira este post',
    })
})

test('fila social:instagram con context malformado (string en vez de objeto): context null', () => {
    const item = toChatListItem(
        { ...baseRow, platform: 'social:instagram', context: 'not-an-object' },
        'Avatar One',
        extras,
    )
    assert.equal(item.channel, 'social_comment')
    assert.equal(item.socialPlatform, 'instagram')
    assert.equal(item.context, null)
})
