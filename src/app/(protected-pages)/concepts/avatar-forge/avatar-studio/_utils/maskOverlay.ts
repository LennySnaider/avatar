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
export const MASKED_EDIT_INSTRUCTION =
    'MASKED EDIT: the photo has a translucent PURPLE highlight marking the ONLY area to change — apply the edit EXCLUSIVELY there; everything outside it stays IDENTICAL. The purple tint is an annotation: NEVER paint purple in the output.'

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
