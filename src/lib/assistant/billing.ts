/**
 * F5.2 (Estratega) — Cobro por turno del agente de la organización. Envoltorio
 * FINO sobre el chokepoint genérico (`@/lib/billing/wallet`): reserva antes de
 * streamear, liquida con el uso real que devuelve el SDK al terminar, y
 * reembolsa si el turno revienta.
 *
 * POR QUÉ NO ES `withTokens`: esa envoltura liquida con el MISMO importe que
 * reservó (una operación síncrona con precio fijo). Un turno de LLM reserva
 * una estimación (`quote({kind:'assistant_turn'})`, el SKU fijo de
 * `AGENT_MESSAGE_COST_USD`) pero liquida con el uso REAL
 * (`tokensForUsage(usage, model)`) — dos números distintos por diseño, así
 * que el ciclo hold→settle se escribe a mano aquí, no con `withTokens`.
 *
 * OJO CON `increment_agent_counter`: esa RPC (F3, `agent_usage_counters`) NO
 * se llama para el Estratega — su columna `avatar_id` es `uuid not null` (ver
 * `supabase/migrations/20260711180000_agent_autopilot.sql`), y el agente de
 * la organización no tiene avatar. Llamarla con `p_avatar: null` no "fallaría
 * en deduplicar" (como podría sonar por el `on conflict (avatar_id, period,
 * counter)`): directamente violaría el NOT NULL y tiraría el insert. El
 * consumo por org de este agente se lee sumando
 * `org_assistant_messages.tokens_charged` (columna que sí existe para esto,
 * ver la migración `20260918200000_estratega_fase1.sql`), no de esa tabla.
 *
 * Sin try/catch propio: los errores de `holdForOperation`/`settleHold`/
 * `refundHold` se propagan tal cual — cada una de esas funciones YA decide
 * (y loguea) si un fallo de billing debe tumbar el turno o dejarlo pasar
 * (measure-only). Envolverlos aquí solo escondería esa decisión.
 */
import {
    holdForOperation,
    settleHold,
    refundHold,
    type Hold,
    type HoldResult,
} from '@/lib/billing/wallet'
import { tokensForUsage } from '@/lib/billing/catalog'
import type { OrgContext } from '@/lib/tenant/getOrgContext'

/**
 * Reserva los tokens de un turno ANTES de streamear la respuesta.
 *
 * `idempotencyKey: assistant:${messageId}` hace que un reintento del mismo
 * turno (el cliente re-envía tras un corte de red) devuelva el hold ya
 * abierto en vez de cobrar dos veces — mismo patrón que el resto del gate
 * (ver `holdForOperation` en `wallet.ts`).
 *
 * `threadId` viaja en la firma por simetría con `settleAssistantTurn`/
 * `refundAssistantTurn` y para que el caller (la ruta del Estratega, Task 4)
 * tenga un único shape que pasar a las tres — el hold en sí se referencia por
 * `messageId` (ya es único), así que no hace falta en la llamada a
 * `holdForOperation`.
 */
export async function holdAssistantTurn(
    ctx: OrgContext,
    { threadId, messageId }: { threadId: string; messageId: string },
): Promise<HoldResult> {
    void threadId
    return holdForOperation(
        { kind: 'assistant_turn' },
        {
            ctx,
            idempotencyKey: `assistant:${messageId}`,
            refType: 'assistant_message',
            refId: messageId,
        },
    )
}

/**
 * Liquida un turno con el uso REAL que devolvió el SDK (no la estimación del
 * hold). Es el punto donde el cobro deja de ser una promesa y pasa a ser lo
 * que de verdad costó — por eso el caller debe guardar `tokens`/`costUsd` en
 * `org_assistant_messages.tokens_charged`/`cost_usd` (la fila del turno),
 * para que el consumo por org sea auditable sin volver a tocar el ledger.
 */
export async function settleAssistantTurn(
    hold: Pick<Hold, 'holdId'>,
    usage: { inputTokens?: number | null; outputTokens?: number | null },
    model: string,
    opts?: { ctx?: OrgContext },
): Promise<{ tokens: number; costUsd: number; estimated: boolean }> {
    const { tokens, costUsd, estimated } = tokensForUsage(usage, model)
    await settleHold(hold, {
        ctx: opts?.ctx,
        tokensFinal: tokens,
        costUsdFinal: costUsd,
    })
    return { tokens, costUsd, estimated }
}

/** Devuelve el hold entero: el turno murió antes de producir una respuesta. */
export async function refundAssistantTurn(
    hold: Pick<Hold, 'holdId'>,
    reason: string,
    opts?: { ctx?: OrgContext },
): Promise<void> {
    await refundHold(hold, reason, opts)
}
