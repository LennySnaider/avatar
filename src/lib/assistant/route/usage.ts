/**
 * F5.2 (Estratega) Task 4 — CUÁNTO LLEVA GASTADO HOY LA ORGANIZACIÓN.
 *
 * El presupuesto diario (`budgetAllows` de `../budget.ts`) necesita un
 * número: los tokens que el Estratega ya ha cobrado a esta organización en el
 * día en curso. Ese número se obtiene sumando
 * `org_assistant_messages.tokens_charged` de las filas de hoy — la columna
 * que el settle deja escrita (ver `../billing.ts`), no el ledger.
 *
 * POR QUÉ EL DÍA ES UTC Y NO EL DEL USUARIO: el tope es de la ORGANIZACIÓN, y
 * sus miembros pueden estar en husos distintos. Con el día local de quien
 * pregunta, dos personas de la misma org leerían dos contadores distintos y
 * el tope "diario" se estiraría hasta 48 horas. UTC es el único corte que
 * todos los procesos (ruta, servicio de estado, cualquier informe futuro) ven
 * igual.
 *
 * ⚠ LO QUE HAY QUE SABER DE POSTGREST: devuelve como mucho 1000 filas y las
 * TRUNCA EN SILENCIO, aunque se pida un `limit` mayor. Una suma truncada da
 * un consumo MENOR del real, y eso abre el grifo en vez de cerrarlo — el
 * fallo peligroso, no el inocuo. Por eso `usageMaybeTruncated` existe: la
 * ruta avisa por consola cuando la página llegó al tope, para que "el
 * presupuesto no frenaba a nadie" tenga una causa visible en los logs en vez
 * de ser un misterio.
 *
 * PURO: sin imports. Testeable con `tsx --test`.
 */

/**
 * Tope que se le pide a PostgREST. Es intencionadamente alto (mil turnos al
 * día ya serían una anomalía); el techo REAL lo pone el servidor en 1000.
 */
export const USAGE_ROWS_LIMIT = 5000

/** A partir de aquí la página pudo venir capada por PostgREST. */
const POSTGREST_MAX_ROWS = 1000

/**
 * Suma `tokens_charged` de las filas de hoy.
 *
 * Cada fila se lee a la defensiva y por separado: un `null`, un texto o un
 * `NaN` valen 0 en vez de convertir la suma entera en `NaN`. Un presupuesto
 * `NaN` comparado con el tope da `false` en todo, así que una sola fila rota
 * dejaría a la organización sin asistente hasta el día siguiente.
 *
 * Los negativos también caen a 0: `tokens_charged` es un consumo, y un
 * negativo sólo podría venir de una fila corrupta — dejarlo pasar REGALARÍA
 * presupuesto.
 */
export function sumTokensCharged(
    rows: readonly { tokens_charged?: unknown }[],
): number {
    let total = 0
    for (const row of rows) {
        const v = row?.tokens_charged
        if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) continue
        total += v
    }
    return total
}

/**
 * Suma `cost_usd` de las mismas filas. Va aparte de `sumTokensCharged` porque
 * es un `numeric` de Postgres: supabase-js lo entrega como número, pero una
 * columna nula (un turno que nunca llegó a liquidarse) es lo normal aquí, no
 * una anomalía. Se redondea a 6 decimales, la precisión de la columna: sin
 * eso, sumar céntimos en coma flotante saca colas de `0.0000000000001` que
 * acaban pintadas en la pantalla de estado.
 */
export function sumCostUsd(rows: readonly { cost_usd?: unknown }[]): number {
    let total = 0
    for (const row of rows) {
        const v = row?.cost_usd
        if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) continue
        total += v
    }
    return Math.round(total * 1e6) / 1e6
}

/** Medianoche UTC del día del instante dado, en ISO (lo que come `.gte()`). */
export function utcDayStart(now: Date): string {
    return new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    ).toISOString()
}

/** ¿Pudo PostgREST haber capado la página y por tanto la suma? */
export function usageMaybeTruncated(rowCount: number): boolean {
    return rowCount >= POSTGREST_MAX_ROWS
}
