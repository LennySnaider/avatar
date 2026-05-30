/**
 * Pick a file extension from a blob's ACTUAL MIME type, not a hardcoded guess.
 *
 * Image providers return different formats: GPT 4o and Gemini deliver PNG,
 * some others JPEG or WebP. Forcing `.jpg` mislabels the file and makes some
 * image viewers refuse to open it because the extension and the bytes disagree.
 */
export function extensionForBlob(blob: Blob, fallback: string): string {
    const t = (blob.type || '').toLowerCase()
    if (t === 'image/png') return 'png'
    if (t === 'image/jpeg' || t === 'image/jpg') return 'jpg'
    if (t === 'image/webp') return 'webp'
    if (t === 'image/gif') return 'gif'
    if (t.startsWith('video/mp4')) return 'mp4'
    if (t.startsWith('video/webm')) return 'webm'
    if (t.startsWith('video/quicktime')) return 'mov'
    return fallback
}

/**
 * Download a remote media URL to the user's machine with the correct extension.
 *
 * Fetches the URL as a blob (works for external/CDN URLs like Kling and for
 * Supabase storage), derives the extension from the real MIME type, and
 * triggers an anchor download. Falls back to opening the URL in a new tab if
 * the fetch fails (e.g. CORS), so the user can still save manually.
 *
 * @param url      Source media URL.
 * @param baseName File name WITHOUT extension (e.g. "avatar-image-1700000000").
 * @param isVideo  Whether the media is a video — used only for the fallback
 *                 extension when the MIME type is missing/unknown.
 */
export async function downloadMediaUrl(
    url: string,
    baseName: string,
    isVideo: boolean,
): Promise<void> {
    try {
        const response = await fetch(url)
        const blob = await response.blob()
        const blobUrl = window.URL.createObjectURL(blob)

        const ext = extensionForBlob(blob, isVideo ? 'mp4' : 'png')

        const link = document.createElement('a')
        link.href = blobUrl
        link.download = `${baseName}.${ext}`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)

        window.URL.revokeObjectURL(blobUrl)
    } catch (error) {
        console.error('Download failed:', error)
        // Fallback: open in a new tab so the user can save manually.
        window.open(url, '_blank')
    }
}
