/**
 * Ajuste de fotos al feed de Instagram (server-only: almacén de media). El
 * render vive en `instagramFitRender.ts` (solo sharp) y las decisiones en
 * `instagramFitRules.ts` (puro, testeado); aquí se une todo con la subida.
 *
 * La variante se guarda en el almacén activo (R2 hoy) bajo
 * `org/{org}/social/instagram/{generationId}-{fit}.jpg`: el mismo par
 * generación+ajuste siempre produce el mismo objeto, así que repetir un post
 * no acumula ficheros. Se sube con `upsert` por si cambia la receta.
 */
import { putMediaObject } from '@/lib/mediaStore'
import { orgStoragePath } from '@/lib/storagePaths'
import { renderInstagramFit } from '@/lib/social/instagramFitRender'
import type { InstagramFit } from '@/lib/social/instagramFitRules'

export { renderInstagramFit } from '@/lib/social/instagramFitRender'

/**
 * URL pública de la foto lista para Instagram: la original si ya cumple, o la
 * variante recién generada y subida. Lanza si no se puede leer la fuente o
 * subir la variante: mejor fallar el post que publicarlo con franjas.
 */
export async function prepareInstagramPhotoUrl(opts: {
    organizationId: string
    generationId: string
    sourceUrl: string
    fit: InstagramFit
}): Promise<{ url: string; changed: boolean }> {
    const res = await fetch(opts.sourceUrl)
    if (!res.ok) throw new Error(`Could not read the source image (${res.status})`)
    const source = Buffer.from(await res.arrayBuffer())

    const rendered = await renderInstagramFit(source, opts.fit)
    if (!rendered) return { url: opts.sourceUrl, changed: false }

    const path = orgStoragePath(
        opts.organizationId,
        'social',
        'instagram',
        `${opts.generationId}-${opts.fit}.jpg`,
    )
    const { url } = await putMediaObject({
        path,
        body: rendered.buffer,
        contentType: 'image/jpeg',
        upsert: true,
    })
    return { url, changed: true }
}
