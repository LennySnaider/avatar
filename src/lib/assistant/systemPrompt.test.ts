// src/lib/assistant/systemPrompt.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildStrategistSystemPrompt } from './systemPrompt.ts'

const base = {
    orgName: 'Agencia Prime',
    avatars: [
        { name: 'Mia', platforms: ['instagram', 'tiktok'], aiOn: true },
        { name: 'Luna', platforms: [], aiOn: false },
    ],
    screen: 'inbox' as const,
    hasMeta: false,
    today: '2026-09-18',
}

test('nombra la organización y la fecha de hoy', () => {
    const p = buildStrategistSystemPrompt(base)
    assert.match(p, /Agencia Prime/)
    assert.match(p, /2026-09-18/)
})

test('lista los avatares con sus redes y si la IA está encendida', () => {
    const p = buildStrategistSystemPrompt(base)
    assert.match(p, /Mia/)
    assert.match(p, /instagram/)
    assert.match(p, /tiktok/)
    assert.match(p, /Luna/)
    // Luna no tiene redes conectadas: debe decirse, no omitirse.
    assert.match(p, /Luna[^\n]*sin redes/i)
})

test('sin avatares lo dice en vez de dejar la lista vacía', () => {
    const p = buildStrategistSystemPrompt({ ...base, avatars: [] })
    assert.match(p, /no tiene avatares|todavía no hay avatares/i)
})

test('las reglas duras están escritas: no inventar cifras y responder ya', () => {
    const p = buildStrategistSystemPrompt(base)
    assert.match(p, /nunca inventes cifras/i)
    assert.match(p, /herramientas/i)
    assert.match(p, /no encadenes llamadas innecesarias/i)
})

test('dice desde qué pantalla se abrió el widget', () => {
    assert.match(buildStrategistSystemPrompt(base), /inbox/i)
    assert.match(
        buildStrategistSystemPrompt({ ...base, screen: 'social-posts' }),
        /publicaciones/i,
    )
})

test('Meta SIN conectar: explica cómo conectarlo y NO promete datos de anuncios', () => {
    const p = buildStrategistSystemPrompt({ ...base, hasMeta: false })
    assert.match(p, /Meta/)
    assert.match(p, /no est[áa] conectad/i)
    assert.match(p, /bot[óo]n/i)
    assert.doesNotMatch(p, /Meta Ads est[áa] conectado/i)
})

test('Meta conectado: lo dice y no repite las instrucciones de conexión', () => {
    const p = buildStrategistSystemPrompt({ ...base, hasMeta: true })
    assert.match(p, /Meta Ads est[áa] conectado/i)
    assert.doesNotMatch(p, /no est[áa] conectad/i)
})

test('es determinista: mismas entradas, mismo texto', () => {
    assert.equal(
        buildStrategistSystemPrompt(base),
        buildStrategistSystemPrompt({ ...base }),
    )
})
