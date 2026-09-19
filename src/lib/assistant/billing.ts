/**
 * F5.2 (Estratega) — Cobro por turno del agente de la organización. Envoltorio
 * FINO sobre el chokepoint genérico (`@/lib/billing/wallet`): reserva antes de
 * streamear, liquida con el uso real que devuelve el SDK al terminar, y
 * reembolsa si el turno revienta.
 *
 * POR QUÉ NO ES `withTokens`: esa envoltura liquida con el MISMO importe que
 * reservó (una operación síncrona con precio fijo). Un turno de LLM reserva
 * un TECHO (`quote({kind:'assistant_turn'})`, `ASSISTANT_TURN_CEILING_USD`
 * de `catalog.ts`) pero liquida con el uso REAL
 * (`tokensForUsage(usage, model)`) — dos números distintos por diseño, así
 * que el ciclo hold→settle se escribe a mano aquí, no con `withTokens`.
 *
 * POR QUÉ EL HOLD ES UN TECHO Y NO UN PROMEDIO: `wallet_settle` (la RPC de
 * `wallet.ts`) hace `least(p_tokens_final, v_held)` — JAMÁS puede cobrar más
 * de lo reservado, solo menos. Si el hold reservara el promedio medido en
 * Fase 0, cualquier turno más caro (uno con MCP llegó a $0.043) se cobraría
 * de menos EN SILENCIO. `settleAssistantTurn` de abajo compara el uso real
 * contra `hold.tokens` y avisa con `console.warn` si lo excede — la RPC ya
 * capa el cobro, pero sin ese aviso nadie se entera de que el techo se educó
 * mal y hay que subirlo.
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
 *
 * `maxTokens` es el tope de `org_modules.settings` (p.ej. `perTurnTokenCap`,
 * Task 4 lo define) para esta org/módulo. Sin él, `quote()` usa el techo por
 * defecto `ASSISTANT_TURN_CEILING_USD`; con él, el caller decide cuánto
 * reservar como máximo — por ejemplo, para no dejar que un solo turno agote
 * el presupuesto diario de la org.
 */
export async function holdAssistantTurn(
    ctx: OrgContext,
    {
        threadId,
        messageId,
        maxTokens,
    }: { threadId: string; messageId: string; maxTokens?: number },
): Promise<HoldResult> {
    void threadId
    return holdForOperation(
        { kind: 'assistant_turn', maxTokens },
        {
            ctx,
            idempotencyKey: `assistant:${messageId}`,
            refType: 'assistant_message',
            refId: messageId,
        },
    )
}

/**
 * Liquida un turno con el uso REAL que devolvió el SDK (no el techo del
 * hold). Es el punto donde el cobro deja de ser una promesa y pasa a ser lo
 * que de verdad costó — por eso el caller debe guardar `tokens`/`costUsd` en
 * `org_assistant_messages.tokens_charged`/`cost_usd` (la fila del turno),
 * para que el consumo por org sea auditable sin volver a tocar el ledger.
 *
 * `hold` necesita `tokens` (no solo `holdId`): es lo reservado, y esta
 * función lo compara contra el uso real para saber si `wallet_settle` tuvo
 * que capar el cobro (`least(p_tokens_final, v_held)` en la RPC — ella lo
 * capa de todos modos, esto es solo para no perder el aviso). `capped` en el
 * resultado es esa señal: el caller (la ruta, Task 4) puede usarla para
 * subir `maxTokens` en `org_modules.settings` si se repite.
 */
export async function settleAssistantTurn(
    hold: Pick<Hold, 'holdId' | 'tokens'>,
    usage: { inputTokens?: number | null; outputTokens?: number | null },
    model: string,
    opts?: { ctx?: OrgContext },
): Promise<{
    tokens: number
    costUsd: number
    estimated: boolean
    capped: boolean
}> {
    const { tokens, costUsd, estimated } = tokensForUsage(usage, model)
    const capped = tokens > hold.tokens
    if (capped) {
        // La RPC ya capa el cobro (least contra v_held) — este warn es la
        // única forma de enterarse de que el techo se quedó corto para este
        // modelo/turno y hay que revisar ASSISTANT_TURN_CEILING_USD o el
        // maxTokens de la org.
        console.warn('[assistant billing] uso real por encima de la reserva', {
            holdId: hold.holdId,
            heldTokens: hold.tokens,
            tokens,
            model,
        })
    }
    await settleHold(hold, {
        ctx: opts?.ctx,
        tokensFinal: tokens,
        costUsdFinal: costUsd,
    })
    return { tokens, costUsd, estimated, capped }
}

/** Devuelve el hold entero: el turno murió antes de producir una respuesta. */
export async function refundAssistantTurn(
    hold: Pick<Hold, 'holdId'>,
    reason: string,
    opts?: { ctx?: OrgContext },
): Promise<void> {
    await refundHold(hold, reason, opts)
}
