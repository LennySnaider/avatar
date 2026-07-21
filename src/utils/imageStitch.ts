/**
 * Utilidades client-side para armar el BODY ANGLE SHEET a partir de 3 imágenes
 * generadas por separado (frente / lado / espalda) — un solo modelo t2i no logra
 * las 3 vistas en una imagen, así que se generan aparte y se unen aquí con canvas.
 */

/** Carga una URL (data: o http[s]:) en un HTMLImageElement. */
function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('No se pudo cargar la imagen'))
        img.src = src
    })
}

/**
 * Normaliza cualquier URL a un data URL base64 (necesario para pintar en canvas
 * sin "tainting" cross-origin y para que el guardado suba los bytes). Si ya es
 * data:, la devuelve tal cual.
 */
export async function urlToDataUrl(url: string): Promise<string> {
    if (url.startsWith('data:')) return url
    const blob = await fetch(url).then((r) => r.blob())
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(blob)
    })
}

/**
 * Une varias imágenes en una sola tira HORIZONTAL (todas escaladas a una altura
 * común). Devuelve un data URL JPEG. Recibe data URLs (usar urlToDataUrl antes
 * para fuentes http[s], evita canvas tainted).
 */
export async function stitchImagesHorizontal(
    dataUrls: string[],
    opts?: { gap?: number; background?: string },
): Promise<string> {
    const gap = opts?.gap ?? 8
    const background = opts?.background ?? '#ededed'
    const imgs = await Promise.all(dataUrls.map(loadImage))
    if (imgs.length === 0) throw new Error('Sin imágenes para unir')

    const height = Math.max(...imgs.map((i) => i.naturalHeight || 1))
    const scaled = imgs.map((img) => ({
        img,
        w: Math.round(
            (img.naturalWidth || 1) * (height / (img.naturalHeight || 1)),
        ),
    }))
    const totalWidth =
        scaled.reduce((sum, s) => sum + s.w, 0) + gap * (imgs.length - 1)

    const canvas = document.createElement('canvas')
    canvas.width = totalWidth
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D no disponible')
    ctx.fillStyle = background
    ctx.fillRect(0, 0, totalWidth, height)

    let x = 0
    for (const s of scaled) {
        ctx.drawImage(s.img, x, 0, s.w, height)
        x += s.w + gap
    }
    return canvas.toDataURL('image/jpeg', 0.92)
}
