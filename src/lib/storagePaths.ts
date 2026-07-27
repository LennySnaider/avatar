/**
 * Constructores de URL de Storage — PUROS (solo string building, sin cliente
 * Supabase). Módulo client-safe: los componentes pueden importarlo sin tocar
 * `@/lib/supabase` (restringido por el candado multitenant F4.2.a).
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!

/** Get the public URL for a file in Supabase Storage */
export function getStoragePublicUrl(bucket: string, path: string): string {
    return `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`
}

/**
 * URL pública de la media de una generación, según DÓNDE viva el objeto.
 *
 * Durante la migración a R2 conviven filas viejas (Supabase) y nuevas (R2):
 * `generations.storage_provider` dice cuál es cuál y esta función es el ÚNICO
 * sitio que traduce eso a URL. Mismo path lógico en ambos lados — solo cambia
 * la base — así el backfill voltea el provider sin renombrar nada.
 *
 * Client-safe a propósito (solo strings): la base de R2 viaja en
 * NEXT_PUBLIC_R2_PUBLIC_BASE_URL para que los componentes de galería puedan
 * construirla sin tocar código de servidor.
 */
export function getGenerationMediaUrl(
    path: string,
    provider?: string | null,
): string {
    if (provider === 'r2') {
        const base = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL
        if (base) {
            const encoded = path.split('/').map(encodeURIComponent).join('/')
            return `${base.replace(/\/$/, '')}/${encoded}`
        }
        // Fila marcada r2 sin base configurada: mejor una URL de Supabase que
        // quizá ya no exista, que reventar el render — y el console.warn deja
        // rastro del misconfig.
        console.warn('[storagePaths] fila r2 sin NEXT_PUBLIC_R2_PUBLIC_BASE_URL')
    }
    return getStoragePublicUrl('generations', path)
}

/**
 * Get an optimized/transformed image URL from Supabase Storage.
 * Uses Supabase's image transformation API for on-the-fly resizing.
 */
export function getStorageThumbnailUrl(
    bucket: string,
    path: string,
    options: {
        width?: number
        height?: number
        quality?: number
        resize?: 'cover' | 'contain' | 'fill'
    } = {},
): string {
    const { width = 200, height = 200, quality = 75, resize = 'cover' } = options

    const params = new URLSearchParams({
        width: width.toString(),
        height: height.toString(),
        quality: quality.toString(),
        resize,
    })

    return `${supabaseUrl}/storage/v1/render/image/public/${bucket}/${path}?${params.toString()}`
}
