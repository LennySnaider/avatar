/**
 * Comisión de la plataforma sobre una venta hecha a través de un módulo.
 *
 * NUNCA LANZA. La llama el webhook de compras después de registrar una venta
 * que YA ocurrió: si el ledger falla, lo que hay que hacer es dejar rastro en
 * los logs y devolver la venta como no comisionada, no reventar el webhook y
 * provocar reintentos de Telegram sobre una compra ya procesada.
 */
import { chargeTokens } from './wallet'
import { MODULE_SKU, STAR_USD, starsToUsd, usdToTokens } from './catalog'
import { getModuleDefinition } from '@/lib/modules/catalog'

export interface StarsCommissionInput {
    organizationId: string
    saleId: string
    avatarId: string
    stars: number
    soldBy: 'ai' | 'manual'
    /** Por si otro canal vende en Stars algún día. */
    moduleSlug?: string
    userId?: string | null
}

export interface StarsCommissionResult {
    ledgerId: string | null
    commissionPct: number
    commissionUsd: number
    commissionTokens: number
    starUsd: number
    replayed: boolean
}

// Congelado: se devuelve tal cual (por referencia) desde varias ramas de
// settleStarsCommission, así que todos los llamadores comparten el mismo
// objeto — sin freeze, que uno de ellos lo mutara "sin querer" (p.ej. para
// completar un campo antes de loguearlo) corrompería el valor que ven todos
// los demás.
const EMPTY: StarsCommissionResult = Object.freeze({
    ledgerId: null,
    commissionPct: 0,
    commissionUsd: 0,
    commissionTokens: 0,
    starUsd: STAR_USD,
    replayed: false,
})

export async function settleStarsCommission(
    input: StarsCommissionInput,
): Promise<StarsCommissionResult> {
    const slug = input.moduleSlug ?? 'telegram'
    try {
        const def = await getModuleDefinition(slug)
        if (!def) {
            console.error(`[billing] comisión ${slug}: el módulo no está en el catálogo`)
            return EMPTY
        }

        const pct = input.soldBy === 'ai' ? def.commissionAiPct : def.commissionManualPct
        const grossUsd = starsToUsd(input.stars)
        const commissionUsd = (grossUsd * pct) / 100
        const tokens = usdToTokens(commissionUsd)

        // Una venta de 1 Star al 5% son $0.00065: menos de un token. Asentar 0
        // ensucia el ledger sin cobrar nada.
        if (tokens <= 0) {
            return { ...EMPTY, commissionPct: pct, commissionUsd }
        }

        const res = await chargeTokens({
            organizationId: input.organizationId,
            userId: input.userId ?? null,
            tokens,
            sku: MODULE_SKU.commission(slug),
            refType: 'stars_sale',
            refId: input.saleId,
            idempotencyKey: `stars_sale:${input.saleId}`,
            metadata: {
                stars: input.stars,
                sold_by: input.soldBy,
                pct,
                star_usd: STAR_USD,
                gross_usd: grossUsd,
                avatar_id: input.avatarId,
            },
        })

        if (!res.ok) {
            console.error(`[billing] comisión ${slug} venta ${input.saleId}:`, res.reason)
            return { ...EMPTY, commissionPct: pct, commissionUsd, commissionTokens: tokens }
        }

        return {
            ledgerId: res.ledgerId,
            commissionPct: pct,
            commissionUsd,
            commissionTokens: tokens,
            starUsd: STAR_USD,
            replayed: res.replayed,
        }
    } catch (e) {
        console.error(`[billing] comisión ${slug} venta ${input.saleId}:`, e)
        return EMPTY
    }
}
