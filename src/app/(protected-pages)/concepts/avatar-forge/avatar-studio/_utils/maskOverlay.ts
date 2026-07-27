/**
 * Composite de la máscara del editor sobre la imagen fuente (client-side).
 *
 * El canvas de Drawing exporta trazos MORADOS sobre fondo TRANSPARENTE y a
 * resolución de PANTALLA (el rect del <img>), no la natural de la foto. Eso
 * hacía la máscara casi inservible fuera de Gemini (los KIE i2i no tienen
 * inpainting y la descartaban en silencio) y débil incluso en Gemini (imagen
 * suelta sin contexto espacial). El composite pinta el overlay ESCALADO sobre
 * la foto a resolución natural → el modelo ve exactamente lo que el usuario
 * ve: la foto con la zona a editar resaltada en morado translúcido.
 */

/**
 * Instrucción que acompaña al composite en los paths i2i (KIE/Kling/MiniMax).
 * COMPACTA a propósito: en Qwen viaja dentro del cap de 800 chars.
 */
/**
 * AUDITORÍA 2026-07-27: la versión anterior cerraba con "NEVER paint purple in
 * the output" — una NEGACIÓN en el prompt positivo, que es justo lo que la
 * difusión no procesa: mete "paint purple" en lo que debe dibujar. Wan, que es
 * un fusor literal, calcaba la mancha morada en el resultado (mismo fallo que
 * ya tuvo copiando el óvalo del difuminado de cara el 25/07).
 *
 * Ahora se ATRIBUYE en positivo en vez de prohibir: se dice qué ES la capa
 * (un marcador transparente encima) y de qué color sale la salida (los colores
 * propios de la foto). La prohibición vive donde sí funciona — el
 * negative_prompt, en las rutas que lo aceptan.
 */
export const MASKED_EDIT_INSTRUCTION =
    'MASKED EDIT: a translucent PURPLE highlight marks the ONLY area to change — apply the edit EXCLUSIVELY there, and everything outside it stays IDENTICAL. That highlight is a transparent marker layer sitting on top of the photo: underneath it the scene continues in its own natural colours, and the output renders those real colours, matching the rest of the photo.'

/** Términos para el `negative_prompt` de las rutas que lo aceptan: ahí SÍ es
 * donde una prohibición de color funciona. */
export const MASK_NEGATIVE_TERMS =
    'purple tint, purple overlay, violet wash, magenta patch, coloured highlight over the subject'

/** Caja de la zona pintada, en PÍXELES de la imagen original: [x1,y1,x2,y2]. */
export type MaskBBox = [number, number, number, number]

/**
 * Bounding box de los trazos de la máscara, escalada a la resolución NATURAL
 * de la foto.
 *
 * Existe porque Wan 2.7 (base y pro) acepta `bbox_list`: un canal NATIVO de
 * edición por región. Mandar la zona como coordenadas es estrictamente mejor
 * que pintarla encima — el modelo recibe dónde editar sin recibir un color
 * que pueda copiar. Pintarla nos costó dos rondas: primero calcaba el morado
 * por una negación en el positivo, y después lo seguía calcando igual, porque
 * a un fusor literal le basta con VER el color para reproducirlo.
 *
 * Devuelve null si la máscara está vacía: sin trazos no hay región, y una caja
 * inventada editaría un sitio al azar.
 */
export async function maskBoundingBox(
    sourceDataUrl: string,
    maskDataUrl: string,
): Promise<MaskBBox | null> {
    const [source, mask] = await Promise.all([
        loadImage(sourceDataUrl),
        loadImage(maskDataUrl),
    ])
    // Se lee a resolución del MASK (pantalla) y se escala al final: recorrer
    // los píxeles de una foto 4K para encontrar una caja sería tirar tiempo.
    const canvas = document.createElement('canvas')
    canvas.width = mask.naturalWidth
    canvas.height = mask.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(mask, 0, 0)
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)

    let minX = canvas.width
    let minY = canvas.height
    let maxX = -1
    let maxY = -1
    for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
            // El canal alfa es la señal: el trazo es opaco, el resto vacío.
            if (data[(y * canvas.width + x) * 4 + 3] > 16) {
                if (x < minX) minX = x
                if (x > maxX) maxX = x
                if (y < minY) minY = y
                if (y > maxY) maxY = y
            }
        }
    }
    if (maxX < 0) return null

    const sx = source.naturalWidth / canvas.width
    const sy = source.naturalHeight / canvas.height
    // Un margen pequeño: el trazo suele quedarse justo dentro del borde de lo
    // que se quiere cambiar, y una caja al ras corta la transición.
    const pad = 8
    return [
        Math.max(0, Math.round(minX * sx) - pad),
        Math.max(0, Math.round(minY * sy) - pad),
        Math.min(source.naturalWidth, Math.round(maxX * sx) + pad),
        Math.min(source.naturalHeight, Math.round(maxY * sy) + pad),
    ]
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('No se pudo cargar la imagen'))
        img.src = src
    })
}

export async function compositeMaskOverlay(
    sourceDataUrl: string,
    maskDataUrl: string,
    alpha = 0.5,
): Promise<{ base64: string; mimeType: string }> {
    const [source, mask] = await Promise.all([
        loadImage(sourceDataUrl),
        loadImage(maskDataUrl),
    ])
    const canvas = document.createElement('canvas')
    canvas.width = source.naturalWidth
    canvas.height = source.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2d context unavailable')
    ctx.drawImage(source, 0, 0)
    ctx.globalAlpha = alpha
    // El mask viene a resolución de pantalla → se escala al tamaño natural.
    ctx.drawImage(mask, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
    return { base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' }
}
