/**
 * Bucle de sondeo COMPARTIDO para las tareas de proveedor (KIE / MuleRouter).
 *
 * POR QUÉ EXISTE: cada ruta del Studio traía su propio `while` con la misma
 * forma y el mismo agujero — `const st = await checkXxxTask(id)` a pelo. Ese
 * await es una llamada de red a una server action: si UNA sola falla (Vercel
 * devuelve 502, la pestaña pierde la red un segundo, el móvil cambia de
 * antena), la promesa se rechaza con "Failed to fetch", la excepción sale del
 * bucle y la generación se da por perdida — mientras la tarea sigue viva en
 * KIE, termina bien y su imagen queda en el log del proveedor. Reporte real:
 * "a veces me dice error to fetch y no muestra la imagen aunque en KIE existe".
 *
 * Aquí se separan las DOS cosas que antes se confundían:
 *   - el proveedor dice que la tarea FALLÓ  → terminal, hay que reembolsar.
 *   - la CONSULTA falló (red, 5xx, timeout) → no dice nada de la tarea: se
 *     reintenta en el siguiente tick y el rastro de rescate se conserva.
 *
 * Por eso `timeout` es un resultado distinto de `failed`: significa "no sé
 * cómo acabó", y el llamante NO debe dar de baja la tarea con ese veredicto
 * (dar de baja borra la fila de `pending_generations`, que es justo lo que
 * permite rescatarla después).
 */

/** Forma que devuelven los `check*Task` (KIE dice 'running', MuleRouter
 *  'processing' — el bucle no debería tener que saberlo). */
export type ProviderTaskStatus =
    | { status: 'running' }
    | { status: 'processing' }
    // lastFrameUrl: extra de KIE vídeo (Seedance 2.5 `return_last_frame`);
    // los demás check no lo traen y nadie lo mira.
    | { status: 'done'; url: string; lastFrameUrl?: string }
    | { status: 'failed'; error: string }

export type PollProviderTaskResult =
    /** El proveedor entregó. */
    | { outcome: 'done'; url: string; lastFrameUrl?: string }
    /** El proveedor dijo que falló: terminal y atribuible. */
    | { outcome: 'failed'; error: string }
    /**
     * Se agotó el plazo o la consulta dejó de responder. La tarea PUEDE seguir
     * viva: no se da de baja el rastro y `error` explica cuál de los dos fue.
     */
    | { outcome: 'timeout'; error: string; transient: boolean }

export interface PollProviderTaskOptions {
    /** Una consulta de estado (la server action del proveedor). */
    check: () => Promise<ProviderTaskStatus>
    /** Cuánto se sigue sondeando en total, en ms. */
    budgetMs: number
    /** Espera entre consultas: fija, o en función del tiempo transcurrido. */
    interval: number | ((elapsedMs: number) => number)
    /** Para los logs — de qué tarea hablamos. */
    label?: string
    /**
     * Cuántas consultas SEGUIDAS pueden fallar antes de rendirse. Se cuentan
     * seguidas a propósito: una respuesta buena limpia el contador, así que un
     * bache de red no acumula contra una tarea que por lo demás va bien.
     * 10 × el intervalo típico (5s) ≈ 50s de red caída tolerados.
     */
    maxConsecutiveErrors?: number
}

const messageOf = (e: unknown): string =>
    e instanceof Error ? e.message : String(e)

export async function pollProviderTask(
    opts: PollProviderTaskOptions,
): Promise<PollProviderTaskResult> {
    const { check, budgetMs, interval, label = 'task' } = opts
    const maxConsecutiveErrors = opts.maxConsecutiveErrors ?? 10
    const startedAt = Date.now()
    let consecutiveErrors = 0
    let lastError = ''

    while (Date.now() - startedAt < budgetMs) {
        const elapsed = Date.now() - startedAt
        const waitMs =
            typeof interval === 'number' ? interval : interval(elapsed)
        // La espera va ANTES de la primera consulta: ninguna tarea termina en
        // el instante del submit, y así se respeta la cadencia de siempre.
        await new Promise((r) => setTimeout(r, waitMs))

        let st: ProviderTaskStatus
        try {
            st = await check()
        } catch (e) {
            // La CONSULTA falló, no la tarea. Se reintenta.
            consecutiveErrors++
            lastError = messageOf(e)
            console.warn(
                `[poll:${label}] consulta ${consecutiveErrors}/${maxConsecutiveErrors} falló (${lastError}) — la tarea sigue viva, reintentando`,
            )
            if (consecutiveErrors >= maxConsecutiveErrors) {
                return {
                    outcome: 'timeout',
                    error: `No se pudo consultar el estado ${consecutiveErrors} veces seguidas (${lastError}).`,
                    transient: true,
                }
            }
            continue
        }

        consecutiveErrors = 0
        if (st.status === 'done')
            return {
                outcome: 'done',
                url: st.url,
                // Solo se añade la clave si viene: el shape de siempre no
                // cambia para los llamantes que no la usan.
                ...(st.lastFrameUrl ? { lastFrameUrl: st.lastFrameUrl } : {}),
            }
        if (st.status === 'failed')
            return { outcome: 'failed', error: st.error }
        // 'running' | 'processing' → sigue.
    }

    return {
        outcome: 'timeout',
        error: `La tarea no terminó dentro del plazo (${Math.round(budgetMs / 60_000)} min).`,
        transient: false,
    }
}
