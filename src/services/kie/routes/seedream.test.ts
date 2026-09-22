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
