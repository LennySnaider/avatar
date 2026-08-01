import { apiFetchUrlAsDataUrl } from '@/services/AvatarForgeService'

/**
 * Detecta el tipo REAL del media por sus MAGIC BYTES, ignorando etiquetas.
 *
 * Existe porque las etiquetas MIENTEN: el persist de generaciones nombraba
 * todo `.jpg` y R2 servía bytes PNG con `Content-Type: image/jpeg` — el
 * archivo bajaba como `.jpg` con tripas PNG y Preview de macOS lo rechazaba
 * ("dañado o formato no reconocido"). Los primeros bytes no mienten nunca.
 * Devuelve null si la firma no se reconoce (caller decide el fallback).
 */
export async function sniffMediaType(
    blob: Blob,
): Promise<{ ext: string; mime: string } | null> {
    const b = new Uint8Array(await blob.slice(0, 16).arrayBuffer())
    const ascii = (from: number, to: number) =>
        String.fromCharCode(...b.slice(from, to))
    if (b[0] === 0x89 && ascii(1, 4) === 'PNG')
        return { ext: 'png', mime: 'image/png' }
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
        return { ext: 'jpg', mime: 'image/jpeg' }
    if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP')
        return { ext: 'webp', mime: 'image/webp' }
    if (ascii(0, 4) === 'GIF8') return { ext: 'gif', mime: 'image/gif' }
    if (ascii(4, 8) === 'ftyp') return { ext: 'mp4', mime: 'video/mp4' }
    if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3)
        return { ext: 'webm', mime: 'video/webm' }
    return null
}

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
 * Baja media del CDN del proveedor con fallback por SERVIDOR.
 *
 * Algunos CDNs (MuleRouter siempre, KIE según host, R2 según el CORS del
 * bucket) no mandan cabeceras CORS y el fetch del navegador muere con
 * "Failed to fetch" aunque la URL sirva — en el persist eso costaba la
 * GENERACIÓN entera (pagada y perdida). El proxy autenticado lee los mismos
 * bytes desde el servidor, donde CORS no existe. Los data:/blob: URLs pasan
 * por la vía directa, que sí los maneja.
 */
export async function fetchMediaBlobWithFallback(
    url: string,
    timeoutMs = 60_000,
): Promise<Blob> {
    try {
        // `cache: 'no-store'` NO es paranoia de frescura, es el arreglo de un
        // CORS fantasma: la galería pinta la imagen con <img>, que NO manda
        // Origin, así que la respuesta se guarda en la caché HTTP SIN
        // Access-Control-Allow-Origin. Un fetch() posterior reutiliza esa
        // entrada envenenada y el navegador la rechaza por CORS aunque el
        // servidor SÍ emita la cabecera cuando se la piden (verificado con
        // curl contra R2). Saltarse la caché pide una respuesta con Origin.
        const res = await fetch(url, {
            signal: AbortSignal.timeout(timeoutMs),
            cache: 'no-store',
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return await res.blob()
    } catch (err) {
        if (!/^https:/.test(url)) throw err // data:/blob: no tienen proxy
        console.info('[media] fetch directo falló, vía servidor:', err)
        const { base64, mimeType } = await apiFetchUrlAsDataUrl(url)
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
        return new Blob([bytes], { type: mimeType })
    }
}

/**
 * Download a remote media URL to the user's machine with the correct extension.
 *
 * Fetches the URL as a blob VIA `fetchMediaBlobWithFallback` (direct fetch →
 * authenticated server proxy), derives the extension from the real MIME type,
 * and triggers an anchor download. El fallback viejo de abrir la URL en una
 * pestaña era el bug reportado ("dar Descargar abre una pestaña"): con el CORS
 * del bucket R2 sin el origen (prod) o con la caché envenenada por <img>
 * (localhost), el fetch directo SIEMPRE fallaba y el usuario nunca bajaba el
 * archivo. La pestaña queda solo como último recurso si el proxy también falla.
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
        const blob = await fetchMediaBlobWithFallback(url)
        const blobUrl = window.URL.createObjectURL(blob)

        // Los BYTES mandan sobre la etiqueta: hay objetos ya guardados como
        // `.jpg`/image-jpeg con tripas PNG (ticket viejo hardcodeaba jpg) —
        // por MIME bajarían mal nombrados y macOS no los abre.
        const sniffed = await sniffMediaType(blob)
        const ext =
            sniffed?.ext ?? extensionForBlob(blob, isVideo ? 'mp4' : 'png')

        const link = document.createElement('a')
        link.href = blobUrl
        link.download = `${baseName}.${ext}`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)

        window.URL.revokeObjectURL(blobUrl)
    } catch (error) {
        console.error('Download failed:', error)
        // Último recurso: abrir en pestaña para que el usuario guarde a mano.
        window.open(url, '_blank')
    }
}
