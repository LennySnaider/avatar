/**
 * Recorrido de páginas de `/v1/agencies/earnings`. PURO: recibe el "traer una
 * página" inyectado, así que se prueba sin red ni token.
 *
 * Vive aparte del cliente porque es la pieza que estuvo MAL y en silencio: el
 * endpoint pagina por `page` y responde `{data, pagination:{page,size,hasMore}}`,
 * pero se le pedía `cursor` y se leía un `nextCursor` inexistente. El bucle
 * cortaba en la página 1 y devolvía `truncated:false`, o sea AFIRMANDO haber
 * traído todo. Y como el sync escribe un 0 por cada (creator, día) que no vino,
 * las páginas perdidas no quedaban "sin dato" sino en CERO, encima de ingresos
 * reales. Con test propio para que no vuelva a pasar callando.
 */
import type {
    FanvueAgencyEarningsResponse,
    FanvueAgencyEarningsRow,
} from './types'

export interface CollectAgencyEarningsResult {
    rows: FanvueAgencyEarningsRow[]
    pages: number
    /** true = la ventana quedó INCOMPLETA. Nunca mentir con esto (ver arriba). */
    truncated: boolean
}

export async function collectAgencyEarnings(
    fetchPage: (page: number) => Promise<FanvueAgencyEarningsResponse>,
    opts?: { maxPages?: number },
): Promise<CollectAgencyEarningsResult> {
    const maxPages = opts?.maxPages ?? 60
    const rows: FanvueAgencyEarningsRow[] = []
    let pages = 0

    while (pages < maxPages) {
        const res = await fetchPage(pages + 1)
        pages += 1
        rows.push(...(res.data ?? []))

        if (!res.pagination?.hasMore) return { rows, pages, truncated: false }
        // Red contra el bucle infinito: si `hasMore` dice que sigue habiendo
        // pero la página llegó vacía, la API se contradice — mejor parar que
        // girar. No es truncado: no hay nada más que traer.
        if ((res.data ?? []).length === 0)
            return { rows, pages, truncated: false }
    }
    // Se acabaron las páginas permitidas con `hasMore` aún en true: FALTAN datos.
    return { rows, pages, truncated: true }
}
