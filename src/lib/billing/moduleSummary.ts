/**
 * "¿Cuánto me ha costado este módulo este mes?" — se responde leyendo el
 * ledger por sku, que es la única fuente de verdad del cobro. Nada se
 * recalcula a partir de las ventas: si un asiento falló, aquí tiene que
 * verse que falló.
 */
import { orgSupabase } from '@/lib/org/orgTable'
import { MODULE_SKU, TOKEN_USD } from './catalog'
import { currentPeriodUtc } from './period'

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
    /**
     * true si PostgREST cortó la respuesta antes de traer todas las filas del
     * período (ver `LEDGER_QUERY_LIMIT`): los totales de arriba son un PISO,
     * no el total real, y hay que desconfiar de ellos.
     */
    truncated: boolean
}

/** Primer instante del mes 'YYYY-MM' en UTC. */
function periodStart(period: string): string {
    return `${period}-01T00:00:00.000Z`
}

/**
 * Primer instante del mes SIGUIENTE a 'YYYY-MM', en UTC.
 *
 * Sin este límite superior, un `period` que no sea el mes en curso (la firma
 * admite cualquiera, para poder consultar meses pasados) arrastraría también
 * TODOS los meses posteriores al pedido, inflando el total sin aviso. Hoy es
 * inofensivo porque el único llamador usa el mes actual y "ahora" ya acota por
 * arriba — pero deja de serlo en cuanto alguien pida un mes pasado.
 */
function periodEnd(period: string): string {
    const [year, month] = period.split('-').map(Number)
    // Diciembre → enero del año siguiente: el mes '13' no existe.
    const nextYear = month === 12 ? year + 1 : year
    const nextMonth = month === 12 ? 1 : month + 1
    return `${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00.000Z`
}

/**
 * Techo explícito de la consulta. Es la MISMA cifra que PostgREST ya aplica
 * por defecto (y trunca en silencio si se supera) — fijarla a mano no cambia
 * el comportamiento, sólo lo hace visible: con `count: 'exact'` de abajo se
 * puede comparar cuántas filas hay de verdad contra cuántas llegaron.
 */
const LEDGER_QUERY_LIMIT = 1000

export async function getModuleBillingSummary(
    organizationId: string,
    slug: string,
    period = currentPeriodUtc(),
): Promise<ModuleBillingSummary> {
    const feeSku = MODULE_SKU.fee(slug)
    const commissionSku = MODULE_SKU.commission(slug)

    // ADVERTENCIA: la capa REST de Supabase (PostgREST) limita a 1000 filas por
    // defecto y TRUNCA EN SILENCIO — no hay error, sólo faltan filas. Este
    // filtro (sku de un módulo + un mes) hoy devuelve muy pocas filas y queda
    // lejos del límite, pero si algún día lo superara, la suma de abajo saldría
    // mal. Por eso se pide `count: 'exact'` y se fija `LEDGER_QUERY_LIMIT`
    // explícito: comparando el conteo real de la BD contra las filas que de
    // verdad llegaron, el truncamiento deja de ser silencioso (ver `truncated`
    // más abajo). Si esto creciera mucho de verdad, hace falta paginar
    // (`.range()`) o agregar en SQL en vez de sumar en memoria.
    const { data, error, count } = await orgSupabase()
        .from('token_ledger')
        .select('id, created_at, sku, tokens, metadata', { count: 'exact' })
        .eq('organization_id', organizationId)
        .in('sku', [feeSku, commissionSku])
        .gte('created_at', periodStart(period))
        .lt('created_at', periodEnd(period))
        .order('created_at', { ascending: false })
        .limit(LEDGER_QUERY_LIMIT)
    if (error) throw new Error(error.message)

    const rows = (data ?? []) as unknown as {
        id: string
        created_at: string
        sku: string
        tokens: number
        metadata: Record<string, unknown> | null
    }[]

    // `count` es el total real en la BD para este filtro; `rows.length` es lo
    // que de verdad llegó. Si no coinciden, PostgREST cortó la respuesta: los
    // totales de abajo son un piso, no el número real. Es justo el descuadre
    // silencioso que ya se comió una lectura anterior de esta misma tabla —
    // aquí se convierte en un aviso en vez de un número que parece exacto y no
    // lo es.
    const truncated = typeof count === 'number' && count > rows.length
    if (truncated) {
        console.error(
            `[billing] getModuleBillingSummary(${slug}, ${period}): PostgREST devolvió ${rows.length} de ${count} filas — los totales están incompletos.`,
        )
    }

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
        truncated,
    }
}
