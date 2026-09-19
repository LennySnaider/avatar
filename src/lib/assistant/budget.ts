/**
 * F5.2 (Estratega) — El PRESUPUESTO del agente de la organización: cuántos
 * tokens puede gastar al día y cuánto puede reservar un solo turno.
 *
 * Los topes viven en `org_modules.settings` (JSONB, módulo `strategist`), que
 * es una columna sin forma: la escribe la pantalla de ajustes (Task 6) y la
 * lee la ruta (Task 4). Entre esas dos está este fichero, y su único trabajo
 * es que un JSON con basura NUNCA tumbe un turno ni, peor, abra el grifo:
 * cada campo que no se entiende cae a su valor por defecto, POR SEPARADO.
 *
 * POR QUÉ NO SE USA ZOD AQUÍ: un `safeParse` que falla devuelve "todo mal" y
 * perdería el campo bueno que venía al lado. La lectura campo a campo
 * conserva lo aprovechable, que es justo lo que se quiere de unos ajustes que
 * pueden quedarse a medio migrar.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA UNIDAD: TOKENS DE MONEDERO, NO TOKENS DEL LLM
 * ─────────────────────────────────────────────────────────────────────────
 * Los dos topes se miden en TOKENS DEL MONEDERO (`org_wallets`): la unidad
 * que `wallet_hold` aparta del saldo de la organización y que `wallet_settle`
 * cobra. NO son los tokens que factura Gemini. La conversión la hace
 * `tokensForCostUsd(costUsd) = ceil(costUsd × COST_MARGIN / TOKEN_USD)` =
 * `ceil(costUsd × 3 / 0.001)` (`@/lib/billing/catalog`), o sea: 1 token de
 * monedero = 0,001 USD a precio de cliente, con el margen de 3× ya aplicado
 * sobre el coste del proveedor.
 *
 * Con esa aritmética y lo MEDIDO en Fase 0:
 *  - turno de lectura simple ≈ 0,004 USD de proveedor →  12 tokens de monedero
 *  - turno con una llamada al MCP de Meta ≈ 0,043 USD  → 129 tokens
 *  - techo por defecto de un turno (`ASSISTANT_TURN_CEILING_USD = 0.05`)
 *                                                      → 150 tokens
 *
 * POR QUÉ 200/turno y 2 500/día:
 *  - `perTurnTokenCap: 200` queda POR ENCIMA del techo de 150, así que el
 *    turno más caro medido (129) cabe con margen y ningún turno legítimo
 *    choca contra el tope. Es el número que la ruta pasa como `maxTokens`
 *    del hold, así que es LO QUE SE APARTA DEL SALDO EN CADA TURNO.
 *  - `dailyTokenCap: 2_500` ≈ 200 turnos de lectura o ≈19 de los caros, unos
 *    2,50 USD/día a precio de cliente: un día entero de trabajo, y lo
 *    bastante bajo para que un bucle accidental se note el mismo día.
 *
 * OJO SI VUELVES A TOCAR ESTOS NÚMEROS: los valores anteriores (20 000 por
 * turno, 200 000 al día) estaban pensados en tokens del LLM, pero el hold los
 * gastaba como tokens de MONEDERO — cada turno apartaba 20 000 tokens, o sea
 * 6,67 USD de saldo (`20_000 × 0.001 / 3`), y el tope diario daba para ~16 000
 * turnos en vez de los ~70 que prometía este docblock. Antes de cambiar un
 * tope, mira `tokensForCostUsd` y traduce el USD que quieres gastar.
 *
 * PURO: sin imports. Testeable con `tsx --test`.
 */

/** Ajustes del módulo `strategist` para una organización. */
export interface StrategistSettings {
    /**
     * Techo de TOKENS DE MONEDERO que el asistente puede gastar por día
     * natural (UTC) y organización. Ver la unidad en la cabecera.
     */
    dailyTokenCap: number
    /**
     * Techo de TOKENS DE MONEDERO que un solo turno puede RESERVAR
     * (`maxTokens` del hold). Ver la unidad en la cabecera.
     */
    perTurnTokenCap: number
    /**
     * Qué hace el agente con una acción que escribe. En Fase 1 no hay
     * herramientas que escriban, así que el único valor posible es
     * `'approve'` (pide confirmación). El campo existe ya para que la
     * Fase 2 no tenga que migrar los ajustes de nadie.
     */
    mode: 'approve'
}

export const DEFAULT_STRATEGIST_SETTINGS: StrategistSettings = {
    dailyTokenCap: 2_500,
    perTurnTokenCap: 200,
    mode: 'approve',
}

/**
 * Un tope válido es un número finito y positivo. Los fraccionarios se
 * redondean HACIA ABAJO (un tope de 1500.9 tokens es un tope de 1500: nunca
 * al alza, que sería gastar más de lo pactado).
 */
function readCap(value: unknown, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return fallback
    }
    return Math.floor(value)
}

/**
 * Lee los ajustes del módulo desde el JSONB tal cual sale de la base.
 *
 * Nunca lanza y nunca devuelve campos ausentes: el llamador puede usar el
 * resultado sin comprobar nada.
 */
export function readStrategistSettings(json: unknown): StrategistSettings {
    // `typeof null === 'object'` y un array también lo es: ninguno de los dos
    // es un objeto de ajustes, y leerles propiedades devolvería undefined en
    // silencio (que acabaría en defaults igual, pero por accidente).
    if (typeof json !== 'object' || json === null || Array.isArray(json)) {
        return { ...DEFAULT_STRATEGIST_SETTINGS }
    }
    const raw = json as Record<string, unknown>
    return {
        dailyTokenCap: readCap(
            raw.dailyTokenCap,
            DEFAULT_STRATEGIST_SETTINGS.dailyTokenCap,
        ),
        perTurnTokenCap: readCap(
            raw.perTurnTokenCap,
            DEFAULT_STRATEGIST_SETTINGS.perTurnTokenCap,
        ),
        // No se lee del JSON a propósito: en Fase 1 cualquier otro valor sería
        // una promesa que el código no cumple (no hay herramientas que
        // escriban). Cuando la Fase 2 traiga `'auto'`, ESTA línea es el único
        // sitio que cambia.
        mode: 'approve',
    }
}

/**
 * ¿Le queda presupuesto diario a la organización?
 *
 * `remaining` nunca es negativo: un turno que se pasó del tope (el hold es un
 * techo, el cobro real se liquida después — ver `./billing.ts`) deja el saldo
 * a cero, no en rojo.
 *
 * Entradas no numéricas: `usedToday` inválido se lee como 0 (no bloquear a
 * nadie por un contador roto — el tope de turno sigue en pie) y un `dailyCap`
 * inválido como 0 (sin tope conocido NO se deja pasar; quien llama debe
 * haberlo normalizado con `readStrategistSettings`).
 */
export function budgetAllows({
    usedToday,
    dailyCap,
}: {
    usedToday: number
    dailyCap: number
}): { allowed: boolean; remaining: number } {
    const used = Number.isFinite(usedToday) && usedToday > 0 ? usedToday : 0
    const cap = Number.isFinite(dailyCap) && dailyCap > 0 ? dailyCap : 0
    const remaining = Math.max(0, cap - used)
    return { allowed: remaining > 0, remaining }
}
