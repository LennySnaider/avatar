/**
 * Registro de una venta de Telegram Stars YA CONFIRMADA.
 *
 * `recordStarsSale` la llama el webhook (`src/app/api/webhooks/telegram/[avatarId]/route.ts`)
 * UNA SOLA VEZ por venta, justo después de que la transición atómica de
 * `telegram_stars_sales` (offered → purchased, condicionada al estado
 * anterior) cambiara EXACTAMENTE una fila. La compra ya ocurrió: nada de lo
 * que sigue puede deshacerla, así que nada de esto lanza. Un fallo aquí se
 * registra con `console.error` y se sigue — si tirara, el `try/catch` global
 * del webhook igual respondería 200 (para no provocar una tormenta de
 * reintentos de Telegram), pero el resto de este cuerpo se quedaría sin
 * ejecutar. Cada bloque tiene su propio `try/catch` por la misma razón: que
 * fallen los contadores del ítem no debe impedir que se asiente la comisión,
 * ni al revés.
 *
 * F4.2 Tarea 4 — EXENTO de `orgTable`: corre disparado por el webhook, sin
 * sesión. La `organizationId` no se adivina: viene ya resuelta en el propio
 * `StarsSaleEvent` (la fila de la venta que la transición atómica acaba de
 * devolver), y cada consulta la usa como filtro explícito.
 */
import { orgSupabase } from '@/lib/org/orgTable'
import { settleStarsCommission } from '@/lib/billing/moduleCharges'
import { commissionSaleFields } from './salesCommissionFields'

export interface StarsSaleEvent {
    saleId: string
    organizationId: string
    avatarId: string
    chatId: string
    itemId: string | null
    stars: number
    soldBy: 'ai' | 'manual'
    source: 'inbox' | 'agent' | 'script' | 'broadcast'
    telegramUserId: number
    purchasedAt: string
}

/** 'YYYY-MM' a partir de `purchasedAt` (no de "ahora"): este registro puede
 *  correr con algo de retraso respecto a la transición, y una venta del
 *  último segundo de un mes no debe contarse en el siguiente. Mismo criterio
 *  que `currentPeriod()` en `sendMessage.ts`. */
function periodOf(purchasedAt: string): string {
    return purchasedAt.slice(0, 7)
}

/**
 * Incrementa `sales_count`/`stars_total` del ítem vendido. Best-effort: no es
 * la fuente de verdad del ingreso (eso es el ledger), es la cifra que se
 * enseña en la galería. Lee-y-escribe en vez de un RPC atómico a propósito de
 * mantener esta tarea dentro de sus ficheros — el peor caso de una carrera
 * (dos compras del MISMO ítem en el mismo instante) es una cifra de stats un
 * poco corta, nunca una comisión de más ni de menos.
 *
 * Devuelve el título del ítem para que `recordStarsSale` lo pueda meter en la
 * metadata del asiento — ver `extraMetadata` en `moduleCharges.ts`.
 */
async function bumpItemCounters(
    organizationId: string,
    itemId: string,
    stars: number,
): Promise<string | null> {
    const supabase = orgSupabase()
    const { data: item, error: readError } = await supabase
        .from('telegram_paid_media_items')
        .select('title, sales_count, stars_total')
        .eq('organization_id', organizationId)
        .eq('id', itemId)
        .maybeSingle()
    if (readError) throw new Error(readError.message)
    if (!item) return null // Ítem borrado (on delete set null) — nada que incrementar.

    const { error: writeError } = await supabase
        .from('telegram_paid_media_items')
        .update({
            sales_count: item.sales_count + 1,
            stars_total: item.stars_total + stars,
            updated_at: new Date().toISOString(),
        })
        .eq('organization_id', organizationId)
        .eq('id', itemId)
    if (writeError) throw new Error(writeError.message)

    return item.title
}

/** Se llama UNA vez por venta, después de que la transición a 'purchased'
 *  haya cambiado exactamente una fila. Nunca lanza: la compra ya ocurrió. */
export async function recordStarsSale(event: StarsSaleEvent): Promise<void> {
    let itemTitle: string | null = null
    if (event.itemId) {
        try {
            itemTitle = await bumpItemCounters(event.organizationId, event.itemId, event.stars)
        } catch (e) {
            console.error(`[telegram] recordStarsSale(${event.saleId}): contador del ítem`, e)
        }
    }

    // Contadores de uso del agente — atómicos vía increment_agent_counter
    // (mismo RPC que sendMessage.ts), así que estos SÍ están libres de la
    // carrera que bumpItemCounters acepta arriba.
    try {
        const period = periodOf(event.purchasedAt)
        const supabase = orgSupabase()
        await supabase.rpc('increment_agent_counter', {
            p_org: event.organizationId,
            p_avatar: event.avatarId,
            p_period: period,
            p_counter: 'stars_sold',
            p_delta: event.stars,
        })
        await supabase.rpc('increment_agent_counter', {
            p_org: event.organizationId,
            p_avatar: event.avatarId,
            p_period: period,
            p_counter: 'stars_sales',
            p_delta: 1,
        })
    } catch (e) {
        console.error(`[telegram] recordStarsSale(${event.saleId}): contador de uso del agente`, e)
    }

    // La comisión. `extraMetadata` deja el asiento AUTOSUFICIENTE: si el
    // avatar se borra, `telegram_stars_sales` cae en cascada (F4.2 Tarea 1)
    // pero el asiento del ledger sobrevive — sin esto sobreviviría sabiendo
    // cuántas Stars y a qué % pero no QUIÉN compró ni QUÉ se vendió.
    try {
        const result = await settleStarsCommission({
            organizationId: event.organizationId,
            saleId: event.saleId,
            avatarId: event.avatarId,
            stars: event.stars,
            soldBy: event.soldBy,
            extraMetadata: {
                telegram_user_id: event.telegramUserId,
                item_title: itemTitle,
            },
        })
        // settleStarsCommission NUNCA LANZA (ver su cabecera): ledgerId sale
        // null si el módulo no está en catálogo, si la comisión redondeó a 0
        // tokens, si chargeTokens falló, o si la organización está EXENTA
        // (`result.exempt`, ver `src/lib/billing/exemption.ts`). En los tres
        // primeros casos se guardan el % y el USD calculados (diagnóstico)
        // pero NI el id de asiento NI la fecha de asentado — así "no
        // asentada" nunca se confunde con "comisión cero". La exención es la
        // EXCEPCIÓN a "sin ledgerId, sin fecha": `commissionSaleFields` (ver
        // `./salesCommissionFields.ts`, con su propio test) SÍ marca
        // `settled` cuando es exenta, y por eso aquí SÍ se estampa
        // `commission_settled_at` — la comisión de esta venta quedó
        // RESUELTA, aunque no haya asiento: lo resuelto es que no había nada
        // que cobrar. Sin ese estampado, la reconciliación de fallos
        //   select * from telegram_stars_sales
        //   where status = 'purchased' and commission_settled_at is null;
        // marcaría como rota cada venta del dueño de la plataforma.
        const fields = commissionSaleFields(result)
        const { error } = await orgSupabase()
            .from('telegram_stars_sales')
            .update({
                commission_pct: fields.commission_pct,
                commission_usd: fields.commission_usd,
                commission_tokens: fields.commission_tokens,
                star_usd: fields.star_usd,
                commission_ledger_id: fields.commission_ledger_id,
                commission_exempt: fields.commission_exempt,
                commission_settled_at: fields.settled ? new Date().toISOString() : null,
                updated_at: new Date().toISOString(),
            })
            .eq('organization_id', event.organizationId)
            .eq('id', event.saleId)
        if (error) throw new Error(error.message)
    } catch (e) {
        // La venta sigue siendo válida aunque la comisión no se pudiera
        // escribir: la compra ya ocurrió y su status ya es 'purchased'.
        console.error(`[telegram] recordStarsSale(${event.saleId}): comisión`, e)
    }
}
