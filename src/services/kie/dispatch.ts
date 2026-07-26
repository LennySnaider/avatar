/**
 * Despachador de rutas de imagen KIE — espejo de `submitVideoKieTaskId`.
 *
 * `buildImageRequest` encuentra la ruta del modelo y construye su request; si no
 * hay ruta propia todavía, cae a `buildLegacyRequest` (el build genérico actual,
 * verbatim). A medida que se migra cada modelo, se agrega su ruta a `ROUTES` y
 * el snapshot exige que reproduzca exactamente lo que hoy hace legacy.
 *
 * Este módulo es PURO (solo orquesta builders puros + `ctx.uploadRef`) → el
 * script de snapshot lo importa sin arrastrar Supabase ni la red.
 */

import type { ImageRoute, ImageRouteContext, KieImageRequest } from './context'
import { concreteOutfitClause } from './shared'
import { buildLegacyRequest } from './routes/legacy'
import { zImageRoute } from './routes/zImage'
import { ideogramRoute } from './routes/ideogram'
import { grokRoute } from './routes/grok'
import { nanoBanana2Route } from './routes/nanoBanana2'
import { wanRoute } from './routes/wan'
import { seedreamRoute } from './routes/seedream'
import { qwenRoute } from './routes/qwen'
import { flux2Route } from './routes/flux2'

/**
 * Rutas migradas, en orden de match. Cada modelo migrado se agrega aquí y el
 * snapshot exige `deepEqual` vs legacy antes de considerarlo listo. Lo no
 * listado cae a `buildLegacyRequest` (baseline verbatim).
 */
export const ROUTES: ImageRoute[] = [
    zImageRoute,
    ideogramRoute,
    grokRoute,
    nanoBanana2Route,
    wanRoute,
    seedreamRoute,
    qwenRoute,
    flux2Route,
]

/** Construye el `{model, input, fullApiPrompt}` de KIE para el modelo del ctx. */
export async function buildImageRequest(
    ctx: ImageRouteContext,
): Promise<KieImageRequest> {
    // Guard-hardening: en GENERACIÓN pura (sin clone/deepfake) y sin outfit
    // nombrado, inyecta uno concreto con color — si no, el motor literal rellena
    // el vacío con nude/beige. En clone/deepfake el outfit viene de la IMAGEN →
    // no se toca. Se trabaja sobre una copia (no muta el ctx del caller).
    // La pregunta REAL no es "en que modo estamos" sino "¿ya hay una imagen que
    // trae la ropa puesta?". Enumerar modos dejo fuera la EDICION (2026-07-26,
    // reporte "mande a editar la foto y mando nada que ver"): la foto fuente
    // viaja como `referenceImage` sin rol 'clone', asi que la guarda no la veia
    // y el prompt recibia "dress her in a burgundy wrap blouse…". Qwen es un
    // editor literal: obedecio, la vistio y rehizo la escena entera.
    //
    // No vale con "¿hay referenceImage?": en generacion normal esa imagen es la
    // CARA del avatar, que no lleva ropa — ahi el fallback SI debe actuar.
    const outfitFromImage =
        ctx.deepfakeMode ||
        ctx.editMode ||
        (ctx.referenceImages ?? []).some((r) => r.role === 'clone')
    const outfit = outfitFromImage ? '' : concreteOutfitClause(ctx.prompt)
    const built = outfit ? { ...ctx, prompt: ctx.prompt + outfit } : ctx
    const route = ROUTES.find((r) => r.matches(built.model))
    return route ? route.build(built) : buildLegacyRequest(built)
}

/**
 * ¿El modelo manda el prompt CRUDO (permisivo) o pasa por sanitización? Lo usa
 * la escalera de moderación. Mientras un modelo no tenga ruta propia, la fachada
 * (KieService) mantiene su cálculo legacy de `isPermissiveModel`; esta función
 * solo responde por los ya migrados.
 */
export function routePermissive(model: string): boolean | undefined {
    const route = ROUTES.find((r) => r.matches(model))
    return route ? route.isPermissive : undefined
}
