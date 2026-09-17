/**
 * ¿Un envío que acaba de salir puede bajar la bandera `needs_attention` del
 * chat? Decisión pura, con test, porque las dos condiciones que la componen se
 * aprendieron cada una de un incidente distinto:
 *
 *  1. Sólo la baja el AUTOPILOT. Visto en vivo: el `/start` que el
 *     clasificador escalaba dejaba `needs_attention` con el motivo pegado y
 *     nadie lo bajaba nunca, así que el inbox mostraba a todos los fans
 *     nuevos como si esperasen a una persona aunque el autopilot siguiera
 *     contestando solo. Un envío aprobado a mano NO la toca: ahí el humano ya
 *     estaba dentro y es él quien decide cuándo cerrar el caso.
 *
 *  2. Sólo si NO entró nada nuevo del fan después del mensaje que se envía.
 *     El autopilot escribe el borrador y lo programa con `send_after` (retardo
 *     humanizado, puede ser de minutos). En ese hueco el fan puede mandar otro
 *     mensaje, y ESE puede escalar el chat por lo que sea (pago, queja, tema
 *     sensible). Cuando por fin sale el mensaje viejo, bajar la bandera
 *     borraría una escalada levantada por algo que el autopilot ni ha leído:
 *     el fan pide ayuda de verdad y el inbox lo esconde. La escalada más
 *     nueva manda.
 */
export interface ShouldClearAttentionInput {
    /** `agent_messages.approved_by` del mensaje que se acaba de enviar. */
    approvedBy: string | null | undefined
    /**
     * ¿Existe un mensaje ENTRANTE de este chat posterior al que se envía?
     * Quien no pueda averiguarlo debe pasar `true` (fallar cerrado): dejar la
     * bandera puesta de más sólo cuesta una revisión humana; quitarla de menos
     * puede enterrar una escalada real.
     */
    newerInboundExists: boolean
}

export function shouldClearAttention({
    approvedBy,
    newerInboundExists,
}: ShouldClearAttentionInput): boolean {
    if (approvedBy !== 'autopilot') return false
    return !newerInboundExists
}
