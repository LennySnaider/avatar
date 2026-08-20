// src/services/kie/cloneTiers.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { seedreamRoute } from './routes/seedream.ts'
import { CLONE_STOPS, cloneTier } from '../../utils/cloneTiers.ts'

/**
 * El bug que esto impide repetir (reporte 2026-08-20): el slider tenía 4
 * etiquetas y DOS comportamientos. 100 y 65 salían idénticas porque las dos
 * mandaban el clon como lienzo y solo cambiaba una frase; 40 y 15 «hacían lo
 * que querían» porque por debajo de 50 la imagen NO viajaba y el único
 * portador de contexto era una descripción que en 🌶️ no existe.
 *
 * Nadie lo vio en el código porque para verlo hay que COMPARAR las cuatro
 * salidas entre sí — que es justo lo que hace este test.
 */

const escena =
    'a woman in a red dress on a rooftop at sunset, leaning on the railing, warm side light, medium shot'

const ctxBase = {
    model: 'seedream/5-pro-text-to-image',
    aspectRatio: '9:16',
    prompt: escena,
    referenceImage: { base64: 'cara', mimeType: 'image/jpeg', role: 'face' },
    referenceImages: [
        { base64: 'cara', mimeType: 'image/jpeg', role: 'face' },
        { base64: 'clon', mimeType: 'image/jpeg', role: 'clone' },
    ],
    bodyEmphasis: 'an hourglass (bust 90cm, waist 60cm, hips 100cm — ratio 1.67)',
    hairEmphasis: 'long wavy dark brown',
    eyeEmphasis: 'green eyes',
    identityWeight: 90,
    uploadRef: async () => 'https://stub/ref.jpg',
    cropToAspect: async (r: unknown) => r,
} as never

const construir = async (cloneWeight: number, extra: object = {}) => {
    const built = await seedreamRoute.build({
        ...(ctxBase as object),
        cloneWeight,
        ...extra,
    } as never)
    return {
        prompt: String((built.input as Record<string, unknown>).prompt),
        imagenes: ((built.input as Record<string, unknown>)
            .image_urls ?? []) as string[],
    }
}

/**
 * Marca EXCLUSIVA de cada tramo: la orden que solo él da. Comparar strings no
 * vale —el bug original SÍ cambiaba una frase entre 100 y 65, y aun así las dos
 * salidas eran indistinguibles a la vista—, así que lo que se verifica es que
 * cada tramo lleve SU instrucción y NINGUNA de las otras tres.
 */
const MARCA: Record<number, RegExp> = {
    100: /reproduce it EXACTLY|recreate its EXACT pose/,
    65: /ANOTHER SHOT of that session/,
    40: /clearly INSPIRED BY that photo/,
    15: /take ONLY its lighting quality/,
}

test('cada tramo da SU orden y ninguna de las otras', async () => {
    for (const w of CLONE_STOPS) {
        const { prompt } = await construir(w)
        assert.match(
            prompt,
            MARCA[w],
            `al ${w}% falta su propia instrucción de tramo`,
        )
        for (const otro of CLONE_STOPS) {
            if (otro === w) continue
            assert.doesNotMatch(
                prompt,
                MARCA[otro],
                `al ${w}% se coló la instrucción del tramo ${otro}% — los tramos no son excluyentes`,
            )
        }
    }
})

test('la imagen del clon viaja en LOS CUATRO tramos', async () => {
    for (const w of CLONE_STOPS) {
        const { imagenes } = await construir(w)
        assert.ok(
            imagenes.length >= 2,
            `al ${w}% solo viajan ${imagenes.length} imagen(es): el clon se perdió`,
        )
    }
})

test('solo EXACT trata al clon como LIENZO', async () => {
    for (const w of CLONE_STOPS) {
        const { prompt } = await construir(w)
        const esLienzo = /FIRST attached image is the original photo/.test(
            prompt,
        )
        assert.equal(
            esLienzo,
            cloneTier(w).canvas,
            `al ${w}% el modo lienzo debería ser ${cloneTier(w).canvas}`,
        )
    }
})

test('ningún tramo se queda sin contexto de la referencia', async () => {
    // El fallo reportado en 40/15: la referencia desaparecía del prompt entero.
    // Da igual CÓMO se la nombre; tiene que estar nombrada.
    for (const w of CLONE_STOPS) {
        const { prompt } = await construir(w)
        assert.match(
            prompt,
            /CLONE source|WARDROBE, LOCATION and POSE|STYLE reference|MOOD reference|original photo to recreate|original photo —/,
            `al ${w}% el prompt no menciona la referencia por ningún lado`,
        )
    }
})

test('en 🌶️ sin descripción, la imagen sigue llevando el contexto', async () => {
    // Caso exacto del reporte: escena NSFW cuya descripción del clon es el
    // fallback genérico (Gemini y qwen-vl-max se niegan a describir desnudos).
    // Aun así, cada tramo debe seguir apoyándose en la IMAGEN.
    const fallback =
        '[CLONE: replicate the subject exactly as in the reference image — same pose, outfit, framing, lighting and setting] she is topless on a balcony'
    for (const w of CLONE_STOPS) {
        const { imagenes } = await construir(w, {
            prompt: fallback,
            nsfwIntent: true,
        })
        assert.ok(
            imagenes.length >= 2,
            `🌶️ al ${w}%: sin descripción Y sin imagen no queda contexto ninguno`,
        )
    }
})
