/**
 * Limpieza de marca de agua al subir refs de identidad (cara frontal / angle
 * sheet) — compartido por los 3 hosts (AvatarEditDrawer del studio,
 * AvatarCreatorMain y el AvatarEditDrawer de My Avatars).
 *
 * `removeRefWatermark` (GeminiService) LOCALIZA la marca (gemini-2.5-flash,
 * bbox) y la PARCHA con el color del fondo adyacente vía sharp — NO re-render
 * (Gemini estampa/reproduce su propia ✦ y no puede limpiarla; un i2i del sheet
 * arriesgaría las 9 caras). SWAP del slot vía `onCleaned` con guard por id (si
 * el usuario re-subió otra imagen, el swap viejo NO debe pisarla). NO bloquea
 * la subida: el ref se muestra ya y el parche corre en 2º plano.
 */
import { removeRefWatermark } from '@/services/GeminiService'
import toast from '@/components/ui/toast'
import Notification from '@/components/ui/Notification'
import { createElement } from 'react'

function notify(
    type: 'info' | 'success' | 'warning',
    title: string,
    message: string,
    duration?: number,
) {
    toast.push(
        createElement(Notification, { type, title, duration }, message),
    )
}

/** Timeout duro: sin él, una llamada colgada dejaba el overlay "Limpiando…"
 * PARA SIEMPRE (reporte: angle sheet atorado). Al expirar se usa la original
 * y se libera el slot; si el server termina tarde, su resultado se ignora. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const t = setTimeout(
            () => reject(new Error(`${label} timed out (${ms / 1000}s)`)),
            ms,
        )
        p.then(
            (v) => {
                clearTimeout(t)
                resolve(v)
            },
            (e) => {
                clearTimeout(t)
                reject(e)
            },
        )
    })
}

// Localización (flash) + parche (sharp) — rápido, sin re-render.
const CLEAN_TIMEOUT_MS = 30_000

export async function cleanRefWatermarkInBackground(args: {
    base64: string
    mimeType: string
    /** Etiqueta para los toasts (p.ej. 'cara frontal', 'hoja de ángulos'). */
    label: string
    /** Recibe la imagen LIMPIA — el host reconstruye su ReferenceImage y
     * swapea el slot (con guard por id contra re-subidas). */
    onCleaned: (img: {
        base64: string
        mimeType: string
        url: string
    }) => void
}): Promise<void> {
    const image = { base64: args.base64, mimeType: args.mimeType }
    try {
        const r = await withTimeout(
            removeRefWatermark(image),
            CLEAN_TIMEOUT_MS,
            'limpieza',
        )
        if (r.status === 'clean') {
            notify(
                'info',
                'Marca de agua',
                `La ${args.label} está limpia — no se detectó marca.`,
                2000,
            )
            return
        }
        if (r.status === 'failed') {
            notify(
                'warning',
                'Marca de agua',
                `No se pudo limpiar la ${args.label} — se usa la original.`,
            )
            return
        }
        args.onCleaned({
            base64: r.base64,
            mimeType: r.mimeType,
            url: `data:${r.mimeType};base64,${r.base64}`,
        })
        notify(
            'success',
            'Marca de agua removida',
            `La ${args.label} se limpió automáticamente — recuerda Guardar.`,
            3500,
        )
    } catch (e) {
        // Nunca frenar la subida por la limpieza (incluye timeout).
        console.warn('[watermark] background clean failed:', e)
        const isTimeout = e instanceof Error && /timed out/.test(e.message)
        notify(
            'warning',
            'Marca de agua',
            isTimeout
                ? `La limpieza de la ${args.label} tardó demasiado — se usa la original (puedes re-subirla para reintentar).`
                : `La revisión de la ${args.label} falló — se usa la original.`,
        )
    }
}
