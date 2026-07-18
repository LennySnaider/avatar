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
