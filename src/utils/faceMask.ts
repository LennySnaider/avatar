'use client'

/**
 * Enmascarado de rostro para el Clone Ref (client-side, canvas).
 *
 * El clon aporta escena/pose/outfit/luz PERFECTOS por imagen, pero su cara es un
 * ROSTRO RIVAL que modelos muy adherentes (Seedream Pro) copian, arruinando la
 * identidad del avatar. Solución: difuminar SOLO la cara antes de enviar la
 * imagen → el modelo reproduce todo menos la cara → obligado a usar la del
 * avatar (imagen 1). Con fallback: si no se detecta cara, el caller no enmascara.
 */

export interface FaceBox {
    /** Normalizados 0-1 (x: izquierda→derecha, y: arriba→abajo). */
    x0: number
    y0: number
    x1: number
    y1: number
}

/**
 * Difumina fuertemente la elipse de la cara (con padding) de una imagen base64,
 * dejando el resto intacto. Devuelve base64 JPEG (sin el prefijo `data:`).
 */
export async function maskFaceInImage(
    base64: string,
    box: FaceBox,
    quality = 0.92,
): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
            const canvas = document.createElement('canvas')
            canvas.width = img.width
            canvas.height = img.height
            const ctx = canvas.getContext('2d')
            if (!ctx) {
                reject(new Error('no canvas ctx'))
                return
            }
            ctx.drawImage(img, 0, 0)

            // Caja normalizada → px, con padding (la cara suele exceder el bbox
            // hacia frente/mentón/orejas) para tapar bien todos los rasgos.
            const bw = box.x1 - box.x0
            const bh = box.y1 - box.y0
            const padX = bw * 0.15
            // Padding ASIMÉTRICO: casi nada ARRIBA (para NO tapar la tiara/corona
            // ni el pelo sobre la frente — se perdían) y generoso ABAJO (mentón/
            // mandíbula) y a los lados (mejillas/orejas), que es donde vive la
            // identidad. El bbox de la cara ya empieza en la línea del pelo.
            const padTop = bh * 0.02
            const padBottom = bh * 0.2
            const x0 = Math.max(0, (box.x0 - padX) * img.width)
            const y0 = Math.max(0, (box.y0 - padTop) * img.height)
            const x1 = Math.min(img.width, (box.x1 + padX) * img.width)
            const y1 = Math.min(img.height, (box.y1 + padBottom) * img.height)
            const w = x1 - x0
            const h = y1 - y0
            if (w <= 0 || h <= 0) {
                const same = canvas.toDataURL('image/jpeg', quality)
                resolve(same.split(',')[1] || same)
                return
            }

            // Difuminado fuerte recortado a la elipse de la cara: borra identidad
            // pero conserva la forma/piel de la cabeza (el modelo la "rellena"
            // con la cara del avatar, no con un cuadro negro).
            const blurPx = Math.max(
                22,
                Math.min(48, Math.round(Math.max(w, h) * 0.3)),
            )
            ctx.save()
            ctx.beginPath()
            ctx.ellipse(x0 + w / 2, y0 + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
            ctx.clip()
            ctx.filter = `blur(${blurPx}px)`
            ctx.drawImage(img, 0, 0)
            ctx.restore()

            const out = canvas.toDataURL('image/jpeg', quality)
            resolve(out.split(',')[1] || out)
        }
        img.onerror = () =>
            reject(new Error('failed to load image for masking'))
        img.src = base64.startsWith('data:')
            ? base64
            : `data:${base64.startsWith('iVBOR') ? 'image/png' : 'image/jpeg'};base64,${base64}`
    })
}
