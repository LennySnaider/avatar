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
 * POR QUÉ 200k/día y 20k/turno: Fase 0 midió un turno de lectura simple en
 * ~2.6-2.8k tokens y uno con una llamada al MCP de Meta en ~14k. 20k por
 * turno deja sitio al turno más caro medido con margen; 200k al día son ~70
 * turnos de lectura o ~14 de los caros — suficiente para un día de trabajo y
 * lo bastante bajo para que un bucle accidental se note el mismo día.
 *
 * PURO: sin imports. Testeable con `tsx --test`.
 */

/** Ajustes del módulo `strategist` para una organización. */
export interface StrategistSettings {
    /** Techo de tokens del asistente por día natural (UTC) y organización. */
    dailyTokenCap: number
    /** Techo de lo que un solo turno puede RESERVAR (`maxTokens` del hold). */
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
    dailyTokenCap: 200_000,
    perTurnTokenCap: 20_000,
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
