/**
 * Cómo se traduce un `StarsCommissionResult` (lo que devuelve
 * `settleStarsCommission`) a las columnas de comisión de una fila de
 * `telegram_stars_sales`. La escribe `recordStarsSale` en `./sales.ts`.
 *
 * PURA, y en su PROPIO fichero a propósito: `sales.ts` importa `orgSupabase`
 * de `@/lib/org/orgTable`, que a su vez importa `@/lib/supabase` — y ESE
 * módulo crea el cliente de Supabase (`createClient(...)`) EN CUANTO SE
 * CARGA, leyendo `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`
 * del entorno. Un test que importara `sales.ts` para probar sólo esta
 * decisión reventaría igual con el entorno vaciado (`env -i ... npm test`,
 * la comprobación que exige F4.2), porque cargar el módulo ya dispara esa
 * cadena aunque el test nunca llame a nada que toque la base de datos. Sacar
 * la decisión a un fichero sin esa cadena de imports es lo que la hace
 * testeable.
 *
 * El import de `StarsCommissionResult` es `import type` a propósito: se borra
 * en compilación (tsx/esbuild lo elide del todo) y por eso NO arrastra en
 * tiempo de ejecución los imports reales de `moduleCharges.ts` (que sí
 * terminan en `orgSupabase`).
 */
import type { StarsCommissionResult } from '@/lib/billing/moduleCharges'

export interface CommissionSaleFields {
    commission_pct: number
    commission_usd: number
    commission_tokens: number
    star_usd: number
    commission_ledger_id: string | null
    commission_exempt: boolean
    /**
     * true si la comisión de esta venta quedó RESUELTA: se asentó
     * (`commission_ledger_id` no nulo) O la organización está exenta. Es la
     * señal que decide si `recordStarsSale` estampa `commission_settled_at`.
     * Sin ella, la reconciliación de fallos
     *
     *   select * from telegram_stars_sales
     *   where status = 'purchased' and commission_settled_at is null;
     *
     * confundiría una exención (nada que cobrar, resuelto) con una comisión
     * que nunca se pudo asentar (fallo real, sin resolver).
     */
    settled: boolean
}

/**
 * Traduce el resultado de `settleStarsCommission` a las columnas de la venta.
 * NO pone una fecha real (`recordStarsSale` decide `new Date()` a partir de
 * `settled`) — así la función es determinista y no necesita mockear el reloj
 * para testearla.
 */
export function commissionSaleFields(result: StarsCommissionResult): CommissionSaleFields {
    return {
        commission_pct: result.commissionPct,
        commission_usd: result.commissionUsd,
        commission_tokens: result.commissionTokens,
        star_usd: result.starUsd,
        commission_ledger_id: result.ledgerId,
        commission_exempt: result.exempt,
        settled: result.ledgerId !== null || result.exempt,
    }
}
