/**
 * Geometria de los gestos tactiles del visor (2026-09-19).
 *
 * Vive FUERA del componente a proposito: es aritmetica pura —sin DOM y sin
 * React—, asi que se puede probar sin navegador. Que es justo lo que no
 * teniamos cuando el usuario reporto que "ni en desktop ni en movil se puede
 * hacer zoom ni swipe": el visor no tenia un solo manejador tactil.
 */

export interface GesturePoint {
    x: number
    y: number
}

/** Separacion entre los dos dedos: el numerador del factor de pellizco. */
export function pointerDistance(a: GesturePoint, b: GesturePoint): number {
    return Math.hypot(b.x - a.x, b.y - a.y)
}

/**
 * Punto medio entre los dos dedos. Es el ANCLA del zoom: `applyZoom` deja
 * quieto el punto del contenido que cae bajo el, igual que hace la rueda con
 * el cursor. Asi el pellizco amplia por donde estas mirando y no por el
 * centro del contenedor.
 */
export function pointerMidpoint(
    a: GesturePoint,
    b: GesturePoint,
): GesturePoint {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/** Recorrido horizontal minimo, en px de PANTALLA, para que cuente como swipe. */
export const SWIPE_MIN_DISTANCE_PX = 48

/**
 * Cuanto mas horizontal que vertical tiene que ser el gesto. Sin este filtro
 * un scroll vertical con algo de deriva lateral cambiaria de imagen sin que
 * nadie se lo haya pedido.
 */
export const SWIPE_AXIS_RATIO = 1.5

export type SwipeDirection = 'next' | 'prev' | null

/**
 * Decide si un arrastre es un swipe de navegacion y hacia donde.
 *
 * Solo geometria: quien llama ya ha comprobado que hay UN dedo, que el zoom
 * esta a 1 (con zoom el arrastre es paneo y manda el paneo) y que no se esta
 * recortando ni pintando la mascara.
 */
export function resolveSwipe(
    dx: number,
    dy: number,
    options: { minDistance?: number; axisRatio?: number } = {},
): SwipeDirection {
    const minDistance = options.minDistance ?? SWIPE_MIN_DISTANCE_PX
    const axisRatio = options.axisRatio ?? SWIPE_AXIS_RATIO
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null
    if (Math.abs(dx) < minDistance) return null
    if (Math.abs(dx) < Math.abs(dy) * axisRatio) return null
    // Arrastrar hacia la IZQUIERDA trae lo siguiente, como pasar una pagina.
    return dx < 0 ? 'next' : 'prev'
}
