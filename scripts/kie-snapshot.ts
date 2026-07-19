/**
 * Harness de verificación de las rutas de imagen KIE (sin frameworks de test).
 *
 *   npx tsx scripts/kie-snapshot.ts            # imprime los {model, input} de la matriz
 *   npx tsx scripts/kie-snapshot.ts --check    # compara cada ruta migrada vs legacy (deepEqual)
 *
 * Determinismo: se inyecta un `uploadRef` stub (`https://ref/N`) y un
 * `cropToAspect` identidad, así el `{model, input}` es 100% reproducible. El
 * objetivo: cuando una ruta por modelo reemplace a legacy, su `build()` debe
 * producir EXACTAMENTE el mismo `{model, input}` que `buildLegacyRequest` para
 * cada fixture — esa es la garantía de "cero cambio de comportamiento".
 */

import { deepStrictEqual } from 'node:assert'
import { buildLegacyRequest } from '../src/services/kie/routes/legacy'
import { ROUTES } from '../src/services/kie/dispatch'
import type { ImageRouteContext } from '../src/services/kie/context'

// ── Stubs deterministas (la ÚNICA dependencia con efecto de una ruta) ──────
function makeCtx(
    partial: Partial<ImageRouteContext> & { model: string; prompt: string },
): ImageRouteContext {
    let n = 0
    return {
        aspectRatio: '9:16',
        referenceImage: null,
        referenceImages: undefined,
        bodyEmphasis: undefined,
        hairEmphasis: undefined,
        eyeEmphasis: undefined,
        identityWeight: undefined,
        deepfakeMode: false,
        curveBoost: undefined,
        uploadRef: async () => `https://ref/${n++}`,
        cropToAspect: async (base64, mimeType) => ({ base64, mimeType }),
        ...partial,
    }
}

const FACE = { base64: 'FACEB64', mimeType: 'image/jpeg' }
const bodyEmphasis =
    'classic hourglass, tiny cinched waist (bust 90cm, waist 53cm, hips 90cm — hip-to-waist ratio 1.70)'
const SCENE =
    'A 24 year old woman. [BODY: hourglass, 24yo, tan skin] [FACE: oval face, green eyes] standing in a night parking lot. [CLONE: white ribbed crop top and white mini skirt, mirror selfie in a parking lot] [POSE: standing, one arm raised behind head]'

// ── Matriz de fixtures por modelo ──────────────────────────────────────────
// Cada modelo × {t2i, i2i face-only, i2i+body, i2i+clone, deepfake, edit-shape}.
const MODELS = [
    'seedream/5-pro-image-to-image',
    'seedream/5-lite-text-to-image',
    'wan/2-7-image',
    'grok-imagine/image-to-image',
    'qwen2/text-to-image',
    'nano-banana-2',
    'nano-banana-2-lite',
    'flux-2/pro-text-to-image',
    'z-image',
    'ideogram/v3-text-to-image',
]

function fixturesFor(
    model: string,
): Array<{ name: string; ctx: ImageRouteContext }> {
    const withRefs = (roles: string[]) =>
        roles.map((role) => ({
            base64: role.toUpperCase() + 'B64',
            mimeType: 'image/jpeg',
            role,
        }))
    return [
        { name: 't2i', ctx: makeCtx({ model, prompt: SCENE }) },
        {
            name: 'i2i-face',
            ctx: makeCtx({
                model,
                prompt: SCENE,
                referenceImage: FACE,
                referenceImages: withRefs(['face']),
                identityWeight: 100,
                hairEmphasis: 'brown',
                eyeEmphasis: 'green',
                bodyEmphasis,
            }),
        },
        {
            name: 'i2i-body',
            ctx: makeCtx({
                model,
                prompt: SCENE,
                referenceImage: FACE,
                referenceImages: withRefs(['face', 'body']),
                identityWeight: 100,
                bodyEmphasis,
            }),
        },
        {
            name: 'i2i-clone',
            ctx: makeCtx({
                model,
                prompt: SCENE,
                referenceImage: FACE,
                referenceImages: withRefs(['face', 'clone']),
                identityWeight: 90,
                bodyEmphasis,
                curveBoost: 'DRAMATIC HOURGLASS: hips much wider than waist.',
            }),
        },
        {
            name: 'deepfake',
            ctx: makeCtx({
                model,
                prompt: 'photorealistic',
                referenceImage: FACE,
                referenceImages: withRefs(['face', 'clone']),
                deepfakeMode: true,
            }),
        },
        {
            name: 'edit-shape',
            ctx: makeCtx({
                model,
                prompt: 'make it night',
                referenceImage: FACE,
            }),
        },
    ]
}

async function goldens(): Promise<
    Record<string, { model: string; input: Record<string, unknown> }>
> {
    // Silenciar los [KIE] logs internos del build para que stdout quede limpio.
    const log = console.log
    const warn = console.warn
    console.log = () => {}
    console.warn = () => {}
    const out: Record<
        string,
        { model: string; input: Record<string, unknown> }
    > = {}
    try {
        for (const model of MODELS) {
            for (const fx of fixturesFor(model)) {
                out[`${model} :: ${fx.name}`] = await buildLegacyRequest(fx.ctx)
            }
        }
    } finally {
        console.log = log
        console.warn = warn
    }
    return out
}

async function main() {
    const check = process.argv.includes('--check')
    const golden = await goldens()

    if (!check) {
        console.log(JSON.stringify(golden, null, 2))
        console.log(
            `\n✅ ${Object.keys(golden).length} fixtures construidos (legacy baseline).`,
        )
        return
    }

    // Cada ruta REGISTRADA en el despachador (ROUTES) debe reproducir el golden
    // de legacy para todos los fixtures de su modelo. Silenciar logs de build.
    const log = console.log
    console.log = () => {}
    const warn = console.warn
    console.warn = () => {}
    // Modelos con FIX INTENCIONAL de Fase 6: divergen de legacy a propósito.
    // Para ellos solo exigimos que su build() corra sin crash (no deepEqual).
    // El resto queda CONGELADO: deepEqual == legacy es obligatorio.
    const DIVERGED = ['grok-imagine']
    const isDiverged = (m: string) => DIVERGED.some((d) => m.startsWith(d))
    let fail = 0
    let checked = 0
    const pass: string[] = []
    for (const model of MODELS) {
        const route = ROUTES.find((r) => r.matches(model))
        if (!route) continue
        for (const fx of fixturesFor(model)) {
            const key = `${model} :: ${fx.name}`
            checked++
            if (isDiverged(model)) {
                try {
                    await route.build(fx.ctx)
                    pass.push(
                        `~ ${route.label} ${key} (fix Fase 6, diverge OK)`,
                    )
                } catch (e) {
                    fail++
                    pass.push(`❌ CRASH ${route.label} ${key}: ${e}`)
                }
                continue
            }
            try {
                deepStrictEqual(await route.build(fx.ctx), golden[key])
                pass.push(`✅ ${route.label} ${key}`)
            } catch {
                fail++
                pass.push(`❌ MISMATCH ${route.label} ${key}`)
            }
        }
    }
    console.log = log
    console.warn = warn
    pass.forEach((l) => console.log(l))
    if (fail > 0) {
        console.error(
            `\n❌ ${fail}/${checked} mismatches — una ruta NO reproduce legacy.`,
        )
        process.exit(1)
    }
    const frozen = checked - pass.filter((l) => l.startsWith('~')).length
    console.log(
        `\n✅ ${frozen} fixtures CONGELADOS == legacy · ${checked - frozen} divergen por fix de Fase 6 (build OK).`,
    )
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
