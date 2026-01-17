/**
 * Image Optimization Utilities
 *
 * Provides functions to resize and optimize images for:
 * - Thumbnails (small previews in UI)
 * - API submissions (Gemini/Veo)
 * - Storage URLs with transforms
 */

// Size presets
export const IMAGE_SIZES = {
    THUMBNAIL: { maxWidth: 200, maxHeight: 200, quality: 0.8 },
    PREVIEW: { maxWidth: 400, maxHeight: 400, quality: 0.85 },
    API: { maxWidth: 1024, maxHeight: 1024, quality: 0.9 },
    API_HIGH: { maxWidth: 1536, maxHeight: 1536, quality: 0.9 },
}

type ImageSizePreset = keyof typeof IMAGE_SIZES

interface ResizeOptions {
    maxWidth: number
    maxHeight: number
    quality?: number
    format?: 'jpeg' | 'png' | 'webp'
}

/**
 * Resize a base64 image using Canvas API
 * Preserves aspect ratio and returns optimized base64
 */
export async function resizeBase64Image(
    base64: string,
    options: ResizeOptions | ImageSizePreset = 'API'
): Promise<string> {
    const preset = typeof options === 'string' ? IMAGE_SIZES[options] : null
    const opts = preset ? { ...preset, format: 'jpeg' as const } : (options as ResizeOptions)
    const { maxWidth, maxHeight, quality = 0.9, format = 'jpeg' } = opts

    return new Promise((resolve, reject) => {
        const img = new Image()

        img.onload = () => {
            // Calculate new dimensions preserving aspect ratio
            let { width, height } = img

            if (width > maxWidth || height > maxHeight) {
                const ratio = Math.min(maxWidth / width, maxHeight / height)
                width = Math.round(width * ratio)
                height = Math.round(height * ratio)
            }

            // Create canvas and draw resized image
            const canvas = document.createElement('canvas')
            canvas.width = width
            canvas.height = height

            const ctx = canvas.getContext('2d')
            if (!ctx) {
                reject(new Error('Failed to get canvas context'))
                return
            }

            // Use high-quality image smoothing
            ctx.imageSmoothingEnabled = true
            ctx.imageSmoothingQuality = 'high'

            ctx.drawImage(img, 0, 0, width, height)

            // Convert to base64
            const mimeType = `image/${format}`
            const resizedBase64 = canvas.toDataURL(mimeType, quality)

            // Extract just the base64 part (remove data URI prefix)
            const base64Only = resizedBase64.split(',')[1] || resizedBase64
            resolve(base64Only)
        }

        img.onerror = () => reject(new Error('Failed to load image'))

        // Handle both raw base64 and data URI formats
        const dataUri = base64.startsWith('data:')
            ? base64
            : `data:image/jpeg;base64,${base64}`
        img.src = dataUri
    })
}

/**
 * Create a thumbnail from base64 image
 * Returns data URI for direct use in img src
 */
export async function createThumbnail(
    base64: string,
    size: 'THUMBNAIL' | 'PREVIEW' = 'THUMBNAIL'
): Promise<string> {
    const resized = await resizeBase64Image(base64, size)
    return `data:image/jpeg;base64,${resized}`
}

/**
 * Optimize image for Gemini API
 * Returns clean base64 without data URI prefix
 */
export async function optimizeForApi(
    base64: string,
    highQuality = false
): Promise<string> {
    return resizeBase64Image(base64, highQuality ? 'API_HIGH' : 'API')
}

/**
 * Get Supabase Storage URL with image transformation
 * Uses Supabase's built-in image transformation API
 */
export function getOptimizedStorageUrl(
    baseUrl: string,
    bucket: string,
    path: string,
    options: { width?: number; height?: number; quality?: number; resize?: 'cover' | 'contain' | 'fill' } = {}
): string {
    const { width = 200, height = 200, quality = 80, resize = 'cover' } = options

    // Supabase storage transform URL format
    // https://[project].supabase.co/storage/v1/render/image/public/[bucket]/[path]?width=200&height=200
    const transformUrl = `${baseUrl}/storage/v1/render/image/public/${bucket}/${path}`
    const params = new URLSearchParams({
        width: width.toString(),
        height: height.toString(),
        quality: quality.toString(),
        resize,
    })

    return `${transformUrl}?${params.toString()}`
}

/**
 * Get thumbnail URL from Supabase Storage
 */
export function getStorageThumbnailUrl(
    supabaseUrl: string,
    bucket: string,
    path: string,
    size: 'small' | 'medium' | 'large' = 'small'
): string {
    const sizes = {
        small: { width: 150, height: 150 },
        medium: { width: 300, height: 300 },
        large: { width: 500, height: 500 },
    }

    return getOptimizedStorageUrl(supabaseUrl, bucket, path, {
        ...sizes[size],
        quality: 80,
        resize: 'cover',
    })
}

/**
 * Clean base64 data by removing data URI prefix
 */
export function cleanBase64(base64: string): string {
    if (!base64) return ''
    return base64.includes(',') ? base64.split(',')[1] : base64
}

/**
 * Check if image needs optimization based on estimated size
 * base64 string length * 0.75 ≈ bytes
 */
export function needsOptimization(base64: string, maxSizeKB = 500): boolean {
    const estimatedBytes = (base64.length * 0.75)
    const estimatedKB = estimatedBytes / 1024
    return estimatedKB > maxSizeKB
}
