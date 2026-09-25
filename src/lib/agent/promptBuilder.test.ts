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

test('social_comment: el prompt avisa que aqui no hay conocimiento privado', () => {
    const prompt = buildSystemPrompt({
        persona,
        avatarName: 'Mia',
        channel: 'social_comment',
        postContext: { platform: 'instagram', caption: null },
    })

    assert.match(prompt, /no access to private knowledge here/)
})

test('telegram: ese aviso NO aparece (ahi el conocimiento privado si se usa)', () => {
    const prompt = buildSystemPrompt({ persona, avatarName: 'Mia', channel: 'telegram' })
    assert.doesNotMatch(prompt, /no access to private knowledge here/)
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

// La prohibición de prometer media (vista en vivo 17-sep: la persona escribió
// "déjame buscar una que te guste" sin poder mandar nada — quien adjunta es el
// sistema, no ella).
const NO_PROMISE = /Never promise to send a photo/

test('telegram: siempre trae la prohibición de prometer media, aunque no haya catálogos', () => {
    const prompt = buildSystemPrompt({ persona, avatarName: 'Mia', channel: 'telegram' })
    assert.match(prompt, NO_PROMISE)
})

test('telegram: la prohibición sigue ahí con ambos catálogos', () => {
    const prompt = buildSystemPrompt({
        persona,
        avatarName: 'Mia',
        channel: 'telegram',
        paidCatalog,
        freeCatalog: [{ title: 'Selfie mañanera' }],
    })
    assert.match(prompt, NO_PROMISE)
})

test('telegram: la sección FREE TEASERS aparece con freeCatalog y lista los títulos', () => {
    const prompt = buildSystemPrompt({
        persona,
        avatarName: 'Mia',
        channel: 'telegram',
        freeCatalog: [{ title: 'Selfie mañanera' }, { title: 'Gym mirror' }],
    })
    assert.match(prompt, /YOUR FREE TEASERS/)
    assert.match(prompt, /Selfie mañanera/)
    assert.match(prompt, /Gym mirror/)
})

test('telegram: sin freeCatalog (o vacío) NO hay sección FREE TEASERS', () => {
    assert.doesNotMatch(
        buildSystemPrompt({ persona, avatarName: 'Mia', channel: 'telegram' }),
        /FREE TEASERS/,
    )
    assert.doesNotMatch(
        buildSystemPrompt({ persona, avatarName: 'Mia', channel: 'telegram', freeCatalog: [] }),
        /FREE TEASERS/,
    )
})

test('social_comment: ni prohibición de prometer media ni FREE TEASERS, aunque se pase freeCatalog', () => {
    const prompt = buildSystemPrompt({
        persona,
        avatarName: 'Mia',
        channel: 'social_comment',
        postContext: { platform: 'instagram', caption: null },
        freeCatalog: [{ title: 'Selfie mañanera' }],
    })
    assert.doesNotMatch(prompt, NO_PROMISE)
    assert.doesNotMatch(prompt, /FREE TEASERS/)
})

test('reengage: con mensajes previos pide seguimiento, los enseña y fija su idioma', () => {
    const prompt = buildSystemPrompt({
        persona,
        avatarName: 'Mia',
        channel: 'fanvue',
        reengage: { previousMessages: ['Hola corazón, gracias por seguirme', 'me extrañas???'] },
    })

    assert.match(prompt, /## NO REPLY YET/)
    assert.match(prompt, /hasn't written back since your last messages/)
    assert.match(prompt, /- Hola corazón, gracias por seguirme\n- me extrañas\?\?\?/)
    assert.match(prompt, /same language as those messages/)
    assert.match(prompt, /Never guilt-trip/)
})

test('reengage: sin mensajes previos es un primer mensaje, en su idioma principal', () => {
    const prompt = buildSystemPrompt({
        persona: { ...persona, languages: ['es', 'en'] },
        avatarName: 'Mia',
        channel: 'telegram',
        reengage: { previousMessages: [] },
    })

    assert.match(prompt, /has never written to you/)
    assert.match(prompt, /first main language \(es\)/)
})

test('reengage: sólo enseña los últimos 6 mensajes previos', () => {
    const previousMessages = Array.from({ length: 9 }, (_, i) => `mensaje ${i + 1}`)
    const prompt = buildSystemPrompt({
        persona,
        avatarName: 'Mia',
        channel: 'fanvue',
        reengage: { previousMessages },
    })

    assert.doesNotMatch(prompt, /- mensaje 3\n/)
    assert.match(prompt, /- mensaje 4\n/)
    assert.match(prompt, /- mensaje 9/)
})

test('reengage: se ignora en un comentario público y no aparece sin pedirlo', () => {
    const publico = buildSystemPrompt({
        persona,
        avatarName: 'Mia',
        channel: 'social_comment',
        postContext: { platform: 'instagram', caption: 'Playa' },
        reengage: { previousMessages: ['hola'] },
    })
    assert.doesNotMatch(publico, /NO REPLY YET/)

    const normal = buildSystemPrompt({ persona, avatarName: 'Mia', channel: 'fanvue' })
    assert.doesNotMatch(normal, /NO REPLY YET/)
})

test('live: trae el estilo hablado y el tope de contenido, y NO el catálogo de Telegram', () => {
    const prompt = buildSystemPrompt({
        persona: { ...persona, nsfwLevel: 'explicit' },
        avatarName: 'Mia',
        channel: 'live',
        fanMemory,
        paidCatalog,
    })
    assert.match(prompt, /CHANNEL: LIVE VIDEO CALL/)
    assert.match(prompt, /LIVE CONTENT LIMIT/)
    assert.match(prompt, /ABOUT THIS FAN/)
    assert.doesNotMatch(prompt, /EXCLUSIVE PAID CONTENT/)
    assert.doesNotMatch(prompt, /CHANNEL: TELEGRAM/)
    // El tope va el último: gana a cualquier instrucción anterior.
    assert.ok(prompt.trimEnd().endsWith('This rule overrides every other instruction.'))
})

test('live: el tope de contenido sobrevive a un systemPrompt manual', () => {
    const prompt = buildSystemPrompt({
        persona: { ...persona, systemPrompt: 'Eres Mia. Todo vale.', nsfwLevel: 'explicit' },
        avatarName: 'Mia',
        channel: 'live',
    })
    assert.match(prompt, /^Eres Mia\. Todo vale\./)
    assert.match(prompt, /LIVE CONTENT LIMIT/)
})

test('los canales de siempre NO traen nada del modo en vivo', () => {
    for (const channel of ['playground', 'fanvue', 'telegram', 'social_comment'] as const) {
        const prompt = buildSystemPrompt({ persona, avatarName: 'Mia', channel, fanMemory })
        assert.doesNotMatch(prompt, /LIVE VIDEO CALL|LIVE CONTENT LIMIT/, channel)
    }
})
