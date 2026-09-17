/**
 * ¿Cabe enviar el mensaje del autopilot DENTRO de la misma función que lo
 * aprobó, o hay que dejárselo al cron?
 *
 * Fichero PURO, sin imports. Medido el 17-sep-2026 en el chat de prueba: una
 * respuesta tardaba 78-86 s en llegar, y 20-27 de esos segundos eran sólo
 * esperar al siguiente tic del cron por minuto (Vercel no baja de 1 min). Si
 * el `send_after` cae dentro del presupuesto que le queda a la función del
 * webhook (`maxDuration` menos un margen), el `after()` espera y envía él
 * mismo; el cron sigue siendo la red para todo lo que no quepa.
 */
export interface ImmediateSendInput {
    /** `agent_messages.send_after` tal como lo dejó `maybeAutopilotSend`. */
    sendAfter: string | null
    /** `Date.now()` en el momento de decidir. */
    nowMs: number
    /** Cuándo arrancó la función que aloja el `after()`. */
    startedAtMs: number
    /** `maxDuration` de la ruta, en ms. */
    maxDurationMs: number
    /** Colchón para el envío en sí y la escritura a BD. Default 10 s. */
    safetyMarginMs?: number
}

/**
 * Milisegundos a esperar antes de enviar (0 = ya venció), o `null` si el
 * envío NO cabe en el presupuesto y debe quedarse en la cola del cron.
 */
export function immediateSendWaitMs(input: ImmediateSendInput): number | null {
    if (!input.sendAfter) return null
    const sendAfterMs = Date.parse(input.sendAfter)
    if (!Number.isFinite(sendAfterMs)) return null
    const margin = input.safetyMarginMs ?? 10_000
    const deadlineMs = input.startedAtMs + input.maxDurationMs - margin
    if (sendAfterMs > deadlineMs) return null
    return Math.max(0, sendAfterMs - input.nowMs)
}
