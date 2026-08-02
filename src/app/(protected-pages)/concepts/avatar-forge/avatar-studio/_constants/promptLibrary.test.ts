// promptLibrary.test.ts — invariantes de la librería de prompts.
// Los presets son DATOS, así que no hay tipo que los salve: un id repetido pisa
// otro en silencio, una acción spicy sin `nsfw` se cuela en el Dice 🎲, y un
// término de edad ambigua tumba la generación o, peor, la cuenta.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MODEL_ACTION_PRESETS } from './modelActionPresets.ts'
import { NICHE_PROMPT_PRESETS } from './nichePromptPresets.ts'
import { NICHE_POSES } from './nichePoses.ts'
import { PLACE_PRESETS, asPlaceTag, placeNameFromText } from './placePresets.ts'

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

// ── Places ──────────────────────────────────────────────────────

test('ids únicos entre locaciones', () => {
    const ids = PLACE_PRESETS.map((p) => p.id)
    assert.equal(new Set(ids).size, ids.length)
})

// La invariante que de verdad importa en un PLACE: describe el SITIO, no a
// quien lo habita. Si además describe un sujeto, compite con el avatar y con la
// pose, y el motor promedia — la sopa de órdenes documentada en el clon de Wan.
const SUJETO_RE =
    /\b(she|her|hers|herself|woman|women|girl|lady|model|person|people(?!\s)|man|men|subject|posing|standing|sitting|wearing)\b/i

test('ninguna locación describe a una persona ni una pose', () => {
    const infractores = PLACE_PRESETS.filter((p) => SUJETO_RE.test(p.text)).map(
        (p) => `${p.id}: ${p.text.match(SUJETO_RE)?.[0]}`,
    )
    assert.deepEqual(infractores, [])
})

test('las locaciones no traen ya el envoltorio del tag', () => {
    // El tag lo pone `asPlaceTag`; si el texto ya lo trae sale `[PLACE: [PLACE:`
    for (const p of PLACE_PRESETS) {
        assert.doesNotMatch(p.text, /\[PLACE:/i, `${p.id} trae el tag dentro`)
    }
})

test('asPlaceTag envuelve exactamente como el flujo de imagen', () => {
    assert.equal(asPlaceTag('Indoor, bedroom.'), '[PLACE: Indoor, bedroom.]')
})

test('el preset de referencia del usuario se conserva literal', () => {
    const p = PLACE_PRESETS.find((x) => x.id === 'place-pink-bedroom')
    assert.ok(p, 'falta el Pink Bedroom')
    assert.equal(
        p!.text,
        'Indoor, bedroom, feminine aesthetic, cozy, light pink color palette, white bedding, pink throw pillow, wall-mounted floating shelves, hanging faux ivy vine, photo collage wall art, small lamp with warm glow, bedside table, minimalist room decor, pastel tones, soft diffused lighting, shallow depth of field, intimate and stylish atmosphere.',
    )
})

test('el nombre derivado describe el sitio, no la hora a la que se guardó', () => {
    const pink = PLACE_PRESETS.find((p) => p.id === 'place-pink-bedroom')!
    assert.equal(placeNameFromText(pink.text), 'Bedroom · feminine aesthetic')
    // "Indoor"/"Outdoor" solos no distinguen: se saltan
    assert.equal(
        placeNameFromText('Outdoor, rooftop terrace, warm, amber palette.'),
        'Rooftop terrace · warm',
    )
})

test('el nombre derivado aguanta entradas degeneradas', () => {
    assert.equal(placeNameFromText(''), 'Place')
    assert.equal(placeNameFromText('Indoor'), 'Place')
    assert.equal(placeNameFromText('   ,  , '), 'Place')
    // Un segmento kilométrico no puede reventar la lista
    const largo = placeNameFromText(`${'x'.repeat(200)}, y`)
    assert.ok(largo.length <= 48, `nombre de ${largo.length} chars`)
})

test('todo preset de código produce un nombre no vacío', () => {
    for (const p of PLACE_PRESETS) {
        assert.ok(placeNameFromText(p.text).length > 0, p.id)
    }
})

test('ninguna locación contiene señales de edad ambigua', () => {
    const infractores = PLACE_PRESETS.filter((p) =>
        EDAD_PROHIBIDA.test(p.text),
    ).map((p) => p.id)
    assert.deepEqual(infractores, [])
})
