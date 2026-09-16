import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSystemPrompt } from './promptBuilder.ts'
import type { PersonaDTO } from './types.ts'

/** Persona mínima pero realista, sin systemPrompt manual, para ejercitar el
 * armado por secciones (si hubiera systemPrompt, pisaría todo lo demás). */
const persona: PersonaDTO = {
    id: 'persona-1',
    avatarId: 'avatar-1',
    enabled: true,
    systemPrompt: null,
    backstory: 'Creció en Miami y ama la playa.',
    personality: { traits: ['playful', 'warm'], interests: ['fitness'], quirks: [], emojiUsage: 'medium' },
    writingStyle: null,
    boundaries: null,
    languages: ['en'],
    chatProvider: 'gemini',
    chatModel: 'gemini-flash-latest',
    hasApiKey: true,
    responseTone: 'flirty',
    responseObjective: 'engagement',
    responseLength: 'short',
    nsfwLevel: 'suggestive',
    updatedAt: '2026-09-16T00:00:00Z',
}

const fanMemory = { summary: 'le encanta hablar de fitness', facts: { nombre: 'Caro' } }
const paidCatalog = [{ title: 'Set playa', stars: 100 }]

test('social_comment: trae la sección PUBLIC COMMENT y el caption, y NO trae Telegram ni el catálogo pago', () => {
    const prompt = buildSystemPrompt({
        persona,
        avatarName: 'Mia',
        channel: 'social_comment',
        postContext: { platform: 'instagram', caption: 'Atardecer en la playa 🌅' },
        paidCatalog, // se pasa igual: el prompt debe ignorarlo en este canal
    })

    assert.match(prompt, /CHANNEL: PUBLIC COMMENT/)
    assert.match(prompt, /Atardecer en la playa 🌅/)
    assert.doesNotMatch(prompt, /CHANNEL: TELEGRAM/)
    assert.doesNotMatch(prompt, /EXCLUSIVE PAID CONTENT/)
})

test('telegram: no trae la sección PUBLIC COMMENT', () => {
    const prompt = buildSystemPrompt({ persona, avatarName: 'Mia', channel: 'telegram' })
    assert.doesNotMatch(prompt, /PUBLIC COMMENT/)
})

test('social_comment: incluye el resumen de memoria del fan, igual que fanvue/telegram', () => {
    const prompt = buildSystemPrompt({
        persona,
        avatarName: 'Mia',
        channel: 'social_comment',
        fanMemory,
        postContext: { platform: 'x', caption: null },
    })
    assert.match(prompt, /le encanta hablar de fitness/)
})
