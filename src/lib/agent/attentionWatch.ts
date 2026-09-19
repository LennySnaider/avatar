/**
 * Qué hilos en atención son NUEVOS desde la última mirada (2026-09-19).
 *
 * PURO, sin DOM ni React: es la parte del vigilante del Inbox que se puede
 * probar sin navegador. El componente (`AttentionWatcher`) sondea el servidor
 * y le pasa aquí lo que ve; esto decide por quién hay que avisar.
 *
 * Nace del reporte "¿por qué dejó de contestar el bot?": el autopilot había
 * escalado el hilo a humano ("Paid media offer needs approval") y nadie se
 * enteró, porque el único sitio que muestra `needs_attention` es la lista del
 * Inbox y solo mientras está abierta. Un hilo que espera aprobación es un fan
 * mirando un chat en silencio.
 *
 * Reglas:
 *  - La PRIMERA mirada no es "todo nuevo": tras recargar la página, avisar uno
 *    por uno de los hilos que ya esperaban sería ruido. Se devuelven como
 *    `backlog` para que el componente dé UN aviso resumen sin sonido (el
 *    navegador tampoco dejaría sonar nada antes de un gesto del usuario).
 *  - A partir de ahí, nuevo = id que no estaba la vez anterior. El conjunto
 *    recordado se sustituye entero en cada mirada: un hilo que se atendió y
 *    vuelve a escalar más tarde se avisa otra vez, que es lo que se quiere.
 */

export interface AttentionSnapshotItem {
    id: string
}

export interface AttentionDiff<T extends AttentionSnapshotItem> {
    /** Hilos que no estaban en la mirada anterior. Vacío en la primera. */
    fresh: T[]
    /** Solo en la primera mirada: lo que ya esperaba al llegar. */
    backlog: T[]
    /** Lo que hay que recordar para la siguiente mirada. */
    nextSeen: Set<string>
}

export function diffAttention<T extends AttentionSnapshotItem>(
    seen: ReadonlySet<string> | null,
    current: readonly T[],
): AttentionDiff<T> {
    const nextSeen = new Set(current.map((c) => c.id))
    if (seen === null) {
        return { fresh: [], backlog: [...current], nextSeen }
    }
    return {
        fresh: current.filter((c) => !seen.has(c.id)),
        backlog: [],
        nextSeen,
    }
}
