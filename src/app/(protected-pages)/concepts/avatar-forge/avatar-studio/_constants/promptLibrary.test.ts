// promptLibrary.test.ts — invariantes de la librería de prompts.
// Los presets son DATOS, así que no hay tipo que los salve: un id repetido pisa
// otro en silencio, una acción spicy sin `nsfw` se cuela en el Dice 🎲, y un
// término de edad ambigua tumba la generación o, peor, la cuenta.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MODEL_ACTION_PRESETS } from './modelActionPresets.ts'
import { NICHE_PROMPT_PRESETS } from './nichePromptPresets.ts'
import { NICHE_POSES } from './nichePoses.ts'

const VALID_TIERS = ['suggestive', 'lingerie', 'topless', 'explicit']

test('ids únicos entre acciones (un duplicado pisa un preset sin avisar)', () => {
    const ids = MODEL_ACTION_PRESETS.map((p) => p.id)
    assert.equal(new Set(ids).size, ids.length)
})

test('ids únicos entre presets de nicho', () => {
    const ids = NICHE_PROMPT_PRESETS.map((p) => p.id)
    assert.equal(new Set(ids).size, ids.length)
})

test('toda acción spicy lleva nsfw:true Y un tramo válido', () => {
    for (const p of MODEL_ACTION_PRESETS.filter((x) => x.category === 'spicy')) {
        assert.equal(p.nsfw, true, `${p.id}: sin nsfw se cuela en el Dice`)
        assert.ok(
            p.tier && VALID_TIERS.includes(p.tier),
            `${p.id}: tramo inválido (${p.tier})`,
        )
    }
})

test('los 4 tramos tienen acciones — el slider llega a 100, la librería también', () => {
    const spicy = MODEL_ACTION_PRESETS.filter((p) => p.category === 'spicy')
    for (const tier of VALID_TIERS) {
        const n = spicy.filter((p) => p.tier === tier).length
        assert.ok(n >= 4, `tramo ${tier} solo tiene ${n} acciones`)
    }
})

test('hay acciones spicy de VIDEO, no solo de imagen', () => {
    const n = MODEL_ACTION_PRESETS.filter(
        (p) => p.category === 'spicy' && p.mediaType === 'VIDEO',
    ).length
    assert.ok(n >= 5, `solo ${n} acciones spicy de vídeo`)
})

test('todo preset de nicho tiene POSE — era el hueco reportado', () => {
    const sinPose = NICHE_PROMPT_PRESETS.filter((p) => !NICHE_POSES[p.id])
    assert.deepEqual(sinPose.map((p) => p.id), [])
})

test('no hay poses huérfanas apuntando a presets que ya no existen', () => {
    const ids = new Set(NICHE_PROMPT_PRESETS.map((p) => p.id))
    const huerfanas = Object.keys(NICHE_POSES).filter((k) => !ids.has(k))
    assert.deepEqual(huerfanas, [])
})

// ── El guard que de verdad importa ──────────────────────────────
// Cualquier señal de minoría de edad hace que el motor rechace la generación y
// pone en riesgo la cuenta de la plataforma. Lo académico se escribe SIEMPRE
// como universitario adulto.
const EDAD_PROHIBIDA =
    /\b(school\s*girl|schoolgirl|high\s*school|teen|teenage|teenager|underage|minor|child|kid|young\s+girl|little\s+girl|barely\s+legal|jailbait)\b/i

test('ningún texto de la librería contiene señales de edad ambigua', () => {
    const textos: { id: string; campo: string; valor: string }[] = []
    for (const p of MODEL_ACTION_PRESETS) {
        textos.push({ id: p.id, campo: 'text', valor: p.text })
        if (p.scene) textos.push({ id: p.id, campo: 'scene', valor: p.scene })
    }
    for (const p of NICHE_PROMPT_PRESETS) {
        textos.push({ id: p.id, campo: 'text', valor: p.text })
    }
    for (const [id, pose] of Object.entries(NICHE_POSES)) {
        textos.push({ id, campo: 'pose.base', valor: pose.base })
        if (pose.spicy)
            textos.push({ id, campo: 'pose.spicy', valor: pose.spicy })
    }

    const infractores = textos
        .filter((t) => EDAD_PROHIBIDA.test(t.valor))
        .map((t) => `${t.id} (${t.campo}): ${t.valor.match(EDAD_PROHIBIDA)?.[0]}`)
    assert.deepEqual(infractores, [])
})

test('los uniformes de autoridad no imitan un cuerpo real', () => {
    const AUTORIDAD = ['uniform-officer-generic', 'uniform-cadet-generic', 'uniform-firefighter-generic']
    // Insignias, escudos y banderas = suplantación: los motores lo rechazan y
    // las plataformas lo sancionan. Se exige que lo declaren sin marcas.
    for (const id of AUTORIDAD) {
        const p = NICHE_PROMPT_PRESETS.find((x) => x.id === id)
        assert.ok(p, `falta el preset ${id}`)
        assert.match(
            p!.text,
            /no insignia|no crests|unaffiliated/i,
            `${id}: debe declararse explícitamente sin insignias`,
        )
    }
})

test('todo preset de uniforme está marcado nsfw (el gate los oculta por defecto)', () => {
    for (const p of NICHE_PROMPT_PRESETS.filter((x) => x.niche === 'uniforms')) {
        assert.equal(p.nsfw, true, `${p.id} sin nsfw`)
    }
})
