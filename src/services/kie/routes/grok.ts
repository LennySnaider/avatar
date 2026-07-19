/**
 * Ruta Grok Imagine (xAI) — i2i-ONLY, PERMISIVO, editor de imagen ÚNICA.
 *
 * Aislada: Grok acepta 1 sola imagen (la cara) y ESPEJA el AR del ref (sin
 * params de tamaño) → se recorta la cara al AR pedido antes de subir. No usa
 * `planExtraRefs` ni eyeClause (editor de imagen única). Reproduce exactamente
 * lo que hacía legacy para 'grok-imagine/image-to-image' (verificado por snapshot).
 *
 * NOTA (pendiente Fase 6): Grok ignora el texto `[CLONE:]` (outfit/escena) y
 * saca ropa/fondo inventados. El fix va AQUÍ, aislado, sin tocar otras rutas.
 */

import type { ImageRoute, ImageRouteContext, KieImageRequest } from '../context'
import {
    relocatePoseTag,
    capAtWordBoundary,
    stripIdentityRedundancy,
    hairClause as buildHairClause,
    faceFidelityClause as buildFaceFidelityClause,
} from '../shared'

async function build(ctx: ImageRouteContext): Promise<KieImageRequest> {
    const hairClause = buildHairClause(ctx.hairEmphasis)
    const faceFidelityClause = buildFaceFidelityClause(ctx.identityWeight)

    // Grok NO es nano-banana-2 → reubica la pose; cap genérico 1800.
    let promptText = relocatePoseTag(ctx.prompt)
    // FIX (Fase 6, verificado A/B live): Grok es i2i — la identidad va en la
    // IMAGEN, así que el [FACE:] de texto (~320 chars) es redundante y comía el
    // presupuesto del cap 1800, DECAPITANDO el [CLONE:] (escena/outfit) → Grok
    // inventaba el fondo (reporte: parking → recámara; medido: prompt 1962 >
    // 1800). Se quita SOLO [FACE:] (bodyInAnchor=false → conserva [BODY:] para
    // el cuerpo) para que el [CLONE:] completo quepa. Aislado: no toca otras rutas.
    if (ctx.referenceImage) {
        promptText = stripIdentityRedundancy(promptText, false)
    }
    const capped = capAtWordBoundary(promptText, 1800, ctx.model)
    const input: Record<string, unknown> = {
        prompt: capped,
        nsfw_checker: false,
    }

    // i2i: 1 sola imagen (la cara), recortada al AR pedido.
    if (ctx.referenceImage) {
        try {
            const cropped = await ctx.cropToAspect(
                ctx.referenceImage.base64,
                ctx.referenceImage.mimeType,
                ctx.aspectRatio,
            )
            const refUrl = await ctx.uploadRef(cropped.base64, cropped.mimeType)
            input.image_urls = [refUrl]
            if (hairClause || faceFidelityClause) {
                input.prompt = `Keep the EXACT face and likeness of the person in the reference image.${faceFidelityClause}${hairClause} ${input.prompt}`
            }
            console.log(
                `[KIE] Grok i2i with 1 identity ref (AR-cropped)${hairClause ? ' + hair override' : ''}`,
            )
        } catch (e) {
            console.warn('[KIE] ref upload failed, staying text-only:', e)
        }
    }

    return { model: ctx.model, input, fullApiPrompt: promptText }
}

export const grokRoute: ImageRoute = {
    label: 'grok',
    matches: (m) => m === 'grok-imagine/image-to-image',
    isPermissive: true,
    build,
}
