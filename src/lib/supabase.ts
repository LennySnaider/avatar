import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/@types/supabase'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * Get the public URL for a file in Supabase Storage
 */
export function getStoragePublicUrl(bucket: string, path: string): string {
    return `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`
}

/**
 * Get an optimized/transformed image URL from Supabase Storage
 * Uses Supabase's image transformation API for on-the-fly resizing
 */
export function getStorageThumbnailUrl(
    bucket: string,
    path: string,
    options: { width?: number; height?: number; quality?: number; resize?: 'cover' | 'contain' | 'fill' } = {}
): string {
    const { width = 200, height = 200, quality = 75, resize = 'cover' } = options

    // Supabase storage render/transform URL format
    const params = new URLSearchParams({
        width: width.toString(),
        height: height.toString(),
        quality: quality.toString(),
        resize,
    })

    return `${supabaseUrl}/storage/v1/render/image/public/${bucket}/${path}?${params.toString()}`
}

// Cliente para uso en el navegador (client-side)
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)

// Cliente para uso en el servidor con service role (server-side only)
export const createServerSupabaseClient = () => {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY is not defined')
    }
    return createClient<Database>(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    })
}

export default supabase
