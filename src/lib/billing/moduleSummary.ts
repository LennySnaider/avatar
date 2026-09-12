/**
 * "¿Cuánto me ha costado este módulo este mes?" — se responde leyendo el
 * ledger por sku, que es la única fuente de verdad del cobro. Nada se
 * recalcula a partir de las ventas: si un asiento falló, aquí tiene que
 * verse que falló.
 */
import { orgSupabase } from '@/lib/org/orgTable'
import { MODULE_SKU, TOKEN_USD } from './catalog'
import { currentPeriodUtc } from './moduleFees'

export interface LedgerEntry {
    id: string
    createdAt: string
    sku: string
    tokens: number
    metadata: Record<string, unknown>
}

export interface ModuleBillingSummary {
    slug: string
    period: string
    feeChargedTokens: number
    commissionTokens: number
    commissionUsd: number
    salesCount: number
    entries: LedgerEntry[]
}

/** Primer instante del mes 'YYYY-MM' en UTC. */
function periodStart(period: string): string {
    return `${period}-01T00:00:00.000Z`
}

export async function getModuleBillingSummary(
    organizationId: string,
    slug: string,
    period = currentPeriodUtc(),
): Promise<ModuleBillingSummary> {
    const feeSku = MODULE_SKU.fee(slug)
    const commissionSku = MODULE_SKU.commission(slug)

    // ADVERTENCIA: la capa REST de Supabase (PostgREST) limita a 1000 filas por
    // defecto y TRUNCA EN SILENCIO — no hay error, sólo faltan filas. Este
    // filtro (sku de un módulo + inicio del mes) hoy devuelve muy pocas filas
    // y queda lejos del límite, pero si algún día lo superara, la suma de abajo
    // saldría mal sin ningún aviso. Si esto crece mucho, hace falta paginar
    // (`.range()`) o agregar en SQL en vez de sumar en memoria.
    const { data, error } = await orgSupabase()
        .from('token_ledger')
        .select('id, created_at, sku, tokens, metadata')
        .eq('organization_id', organizationId)
        .in('sku', [feeSku, commissionSku])
        .gte('created_at', periodStart(period))
        .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)

    const rows = (data ?? []) as unknown as {
        id: string
        created_at: string
        sku: string
        tokens: number
        metadata: Record<string, unknown> | null
    }[]

    const entries: LedgerEntry[] = rows.map((r) => ({
        id: r.id,
        createdAt: r.created_at,
        sku: r.sku,
        tokens: r.tokens,
        metadata: r.metadata ?? {},
    }))

    // Los asientos guardan tokens NEGATIVOS (son débitos); aquí se presentan
    // en positivo porque la pregunta es "cuánto he gastado".
    const sum = (sku: string) =>
        entries.filter((e) => e.sku === sku).reduce((acc, e) => acc + Math.abs(e.tokens), 0)

    const commissionTokens = sum(commissionSku)

    return {
        slug,
        period,
        feeChargedTokens: sum(feeSku),
        commissionTokens,
        commissionUsd: commissionTokens * TOKEN_USD,
        salesCount: entries.filter((e) => e.sku === commissionSku).length,
        entries,
    }
}
