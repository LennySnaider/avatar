/**
 * Lector de la exención de cobro por organización.
 *
 * `isBillingExempt(organizationId)` es el ÚNICO punto que consulta
 * `organizations.billing_exempt`. La llaman el cron de cuotas
 * (`src/lib/billing/moduleFees.ts`) y la comisión de venta
 * (`src/lib/billing/moduleCharges.ts`), ambos SIN sesión — por eso recibe la
 * organización por parámetro en vez de por `OrgContext`, igual que
 * `loadTelegramSettings` en `src/lib/telegram/settings.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ UNA ORGANIZACIÓN EXENTA NO ESCRIBE NINGÚN ASIENTO (ver la migración
 * `billing_exemption` para el detalle completo)
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La invariante que sostiene toda la contabilidad, verificada varias veces:
 *
 *   sum(token_ledger.tokens) == org_wallets.included_balance + purchased_balance
 *
 * Un asiento que registra un importe pero no mueve el saldo rompe esa
 * igualdad para siempre. Y un asiento de CERO tokens mentiría sobre el
 * precio: el precio no era cero, era el que corresponda ($9/mes de la cuota,
 * o el 7%/20% de una venta) y se decidió no cobrarlo.
 *
 * Por eso ningún llamador de esta función debe usarla para "cobrar cero" —
 * deben usarla para decidir NO LLAMAR a `chargeTokens` en absoluto, y contar
 * la exención aparte: el contador `exempt` de `ModuleFeesResult`, el campo
 * `exempt` de `StarsCommissionResult`, y un aviso en el log. Lo exento se
 * cuenta, nunca se asienta.
 *
 * Exenciones (candado F4.2 / `check:tenant`): este fichero usa `orgSupabase()`
 * crudo — motivo escrito en `scripts/check-tenant-access.mjs` y en el bloque
 * `no-restricted-syntax` de `eslint.config.mjs`.
 */
import { orgSupabase } from '@/lib/org/orgTable'

/**
 * ¿Esta organización está exenta de cobro (cuota mensual de módulo Y
 * comisión por venta — la exención cubre las dos)? Ver la cabecera de este
 * fichero y la migración `billing_exemption` para el porqué de que una
 * organización exenta no produzca NINGÚN asiento en el ledger.
 *
 * Sin fila (`organizationId` inexistente): se trata como NO exenta — es el
 * default de la columna, y una organización que no existe tampoco tiene
 * módulos instalados que cobrar.
 */
export async function isBillingExempt(organizationId: string): Promise<boolean> {
    const { data, error } = await orgSupabase()
        .from('organizations')
        .select('billing_exempt')
        .eq('id', organizationId)
        .maybeSingle()
    if (error) throw new Error(error.message)
    return data?.billing_exempt ?? false
}
