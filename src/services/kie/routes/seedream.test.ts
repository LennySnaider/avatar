// src/services/kie/routes/seedream.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { seedreamRoute } from './seedream.ts'
import { REALISM_CLAUSE } from '../realism.ts'
import type { ImageRouteContext } from '../context.ts'
import type { KieRefWithRole } from '../shared.ts'

/**
 * "✨ Realism" (2026-09-22). Lo que importa blindar: con el interruptor
 * APAGADO la ruta manda EXACTAMENTE el mismo prompt que antes — Seedream ya
 * funcionaba bien y Lenny pidió no romperlo —, y encendido el bloque va al
 * final, salvo donde no toca (edición y Body Lab).
 */

const ref = (role?: string): KieRefWithRole => ({
    mimeType: 'image/png',
    url: `https://r2.example/${role ?? 'face'}.png`,
    role,
})

function ctx(over: Partial<ImageRouteContext> = {}): ImageRouteContext {
    return {
        model: 'seedream/5-pro-text-to-image',
        aspectRatio: '9:16',
        prompt: 'A woman by a sunlit window in an off-white knitted sweater, holding a mug.',
        referenceImage: ref(),
        uploadRef: async (r) => r.url ?? 'https://r2.example/subida.png',
        cropToAspect: async (r) => r,
        ...over,
    }
}

const promptOf = async (over: Partial<ImageRouteContext>) =>
    String((await seedreamRoute.build(ctx(over))).input.prompt)

test('apagado: el prompt es idéntico a no pasar el flag (i2i y t2i)', async () => {
    assert.equal(await promptOf({ realismBoost: false }), await promptOf({}))
    assert.equal(
        await promptOf({ referenceImage: null, realismBoost: false }),
        await promptOf({ referenceImage: null }),
    )
})

test('encendido en i2i: el prompt de siempre + el bloque al FINAL', async () => {
    const base = await promptOf({})
    const conRealismo = await promptOf({ realismBoost: true })
    assert.equal(conRealismo, `${base.trimEnd()} ${REALISM_CLAUSE}`)
})

test('encendido en t2i (sin referencia) también se añade', async () => {
    const base = await promptOf({ referenceImage: null })
    const conRealismo = await promptOf({
        referenceImage: null,
        realismBoost: true,
    })
    assert.equal(conRealismo, `${base.trimEnd()} ${REALISM_CLAUSE}`)
})

test('en EDICIÓN no se añade: lo que no se toca no se re-acaba', async () => {
    assert.equal(
        await promptOf({ editMode: true, realismBoost: true }),
        await promptOf({ editMode: true }),
    )
})

test('en el prompt auto-contenido del Body Lab no se añade', async () => {
    assert.equal(
        await promptOf({ selfContainedPrompt: true, realismBoost: true }),
        await promptOf({ selfContainedPrompt: true }),
    )
})

// ─────────────────────────────────────────────────────────────────────────────
// Color de ojos. Nace de un fallo medido (Anasofy, 25-sep): el avatar tiene
// ojos grises en Appearance pero sus fotos de referencia los tienen café
// oscuro. El gris SÍ llegaba al prompt, en una sola frase descriptiva, y
// perdía contra cinco que mandaban los ojos a la imagen 1 — la última, por
// recencia, justo antes de la escena: "her FACE and eyes must remain EXACTLY
// the woman in the FIRST image". Salía café.
// ─────────────────────────────────────────────────────────────────────────────

// La generación real: hoja de cuerpo + hoja de ángulos + clone al 15%.
const conClone = (over: Partial<ImageRouteContext> = {}) =>
    promptOf({
        prompt: '[CLONE: A person wearing an olive green knit sweater, standing in a modern apartment kitchen, medium shot.]',
        referenceImages: [ref('body'), ref('angle'), ref('clone')],
        cloneWeight: 15,
        identityWeight: 100,
        hairEmphasis: 'very long waist-length straight black hair',
        bodyEmphasis:
            'hourglass (bust 96cm, waist 50cm, hips 102cm — hip-to-waist ratio 2.04)',
        ...over,
    })

test('con color de ojos elegido, la orden dice que ANULA el de las fotos', async () => {
    const p = await conClone({ eyeEmphasis: 'gray eyes' })
    assert.match(p, /gray eyes/)
    assert.match(p, /recolou?r ONLY the iris/i)
})

test('el cierre por recencia ya no manda el color del iris a la imagen 1', async () => {
    const p = await conClone({ eyeEmphasis: 'gray eyes' })
    assert.match(p, /Above all: [^.]*gray eyes/)
})

test('el candado de identidad del clone no ata el color de ojos a la foto', async () => {
    const p = await conClone({ eyeEmphasis: 'gray eyes' })
    assert.match(p, /CRITICAL IDENTITY LOCK/)
    assert.equal(/EYE COLOUR, HAIR colour/.test(p), false)
})

test('en modo lienzo (clone EXACT) el iris también se recolorea', async () => {
    const p = await conClone({ eyeEmphasis: 'gray eyes', cloneWeight: 100 })
    assert.match(p, /Swap ONLY the FACE/)
    assert.match(p, /gray eyes[^.]*recolou?r ONLY the iris/i)
})

test('sin color de ojos elegido, el ancla queda como estaba', async () => {
    const p = await conClone()
    assert.match(
        p,
        /Above all: her FACE and eyes must remain EXACTLY the woman in the FIRST image\. Follow/,
    )
    assert.match(p, /EYE COLOUR, HAIR colour/)
    assert.equal(/recolou?r ONLY the iris/i.test(p), false)
})
