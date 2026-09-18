/**
 * Render de la variante para el feed de Instagram — SOLO sharp, sin almacén
 * ni Supabase, para poder ejecutarlo suelto (scripts, pruebas manuales). Las
 * decisiones (¿hace falta?, ¿qué lienzo o recorte?) viven en
 * `instagramFitRules.ts`, puro y testeado; la subida, en `instagramFit.ts`.
 */
import sharp from 'sharp'
import { planInstagramFit, type InstagramFit } from './instagramFitRules'

const JPEG_QUALITY = 90

export interface RenderedInstagramFit {
    buffer: Buffer
    width: number
    height: number
}

/** Devuelve la variante JPEG, o null si la imagen ya cabe en 4:5–1.91:1. */
export async function renderInstagramFit(source: Buffer, fit: InstagramFit): Promise<RenderedInstagramFit | null> {
    const meta = await sharp(source).metadata()
    if (!meta.width || !meta.height) return null
    const plan = planInstagramFit(meta.width, meta.height, fit)
    if (plan.kind === 'none') return null

    if (plan.kind === 'crop') {
        let pipeline = sharp(source).extract(plan.region)
        if (plan.output.width !== plan.region.width) {
            pipeline = pipeline.resize(plan.output.width, plan.output.height)
        }
        const buffer = await pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer()
        return { buffer, ...plan.output }
    }

    const { width, height } = plan.canvas
    // Fondo: la propia foto a "cover", desenfocada y oscurecida. Se desenfoca
    // a un cuarto de tamaño (mucho más rápido) y luego se reescala al lienzo.
    const small = await sharp(source)
        .resize(Math.max(1, Math.round(width / 4)), Math.max(1, Math.round(height / 4)), { fit: 'cover' })
        .blur(8)
        .modulate({ brightness: 0.55, saturation: 0.9 })
        .toBuffer()
    const background = await sharp(small).resize(width, height).toBuffer()
    const foreground = await sharp(source)
        .resize(width, height, { fit: 'inside', withoutEnlargement: true })
        .toBuffer()
    const buffer = await sharp(background)
        .composite([{ input: foreground, gravity: 'centre' }])
        .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
        .toBuffer()
    return { buffer, width, height }
}
