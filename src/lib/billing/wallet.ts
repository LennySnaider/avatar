/**
 * F5.0 — El CHOKEPOINT de gasto. Toda operación que le cuesta dinero a la
 * plataforma pasa por aquí antes de llamar al proveedor.
 *
 * POR QUÉ EN SERVIDOR Y NO EN LA UI: `handleGenerate` (AvatarStudioMain) es un
 * dispatcher de CLIENTE que llama ~15 server actions sueltas. Un medidor puesto
 * ahí se salta desde devtools invocando la action directo — que es exactamente
 * lo que hoy son esos endpoints: gasto real sin medidor. El gate tiene que vivir
 * DENTRO de la server action.
 *
 * CICLO DE VIDA (importa por las tareas async):
 *
 *   const hold = await holdForOperation({ kind:'image', providerId })
 *   … llamar al proveedor …
 *   éxito  → await settleHold(hold)
 *   fallo  → await refundHold(hold, 'provider_error')
 *
 * KIE/MuleRouter son submit→poll conducido por el navegador: si el usuario
 * cierra la pestaña, nadie liquida. Esos holds los barre la reconciliación de
 * `pending_generations` (F5.4) y se reembolsan — un hold sin liquidar NO es una
 * venta, es una tarea perdida.
 */
import { orgSupabase } from '@/lib/org/orgTable'
import { getOrgContext, type OrgContext } from '@/lib/tenant/getOrgContext'
import { quote, type PaidOperation, type Quote } from './catalog'

/**
 * Cliente para el schema de billing. `@/@types/database.generated.ts` todavía
 * no conoce `org_wallets` / `token_ledger` / las funciones `wallet_*` (nacen en
 * la migración 20260729120000 y los tipos se regeneran con `npm run db:types`
 * contra el proyecto ya migrado — pendiente 4.0.2 del plan).
 *
 * Es el mismo patrón que el resto del repo usa para `users` y `video_flows`:
 * cast local ACOTADO A UN SITIO y marcado, en vez de `any` desparramado por los
 * call sites. Al regenerar los tipos, esto se borra y nada más cambia.
 */
type MaybeSingle = {
    maybeSingle: () => Promise<{
        data: unknown
        error: { message: string } | null
    }>
}
type EqChain = MaybeSingle & {
    eq: (col: string, val: string) => EqChain
    order: (col: string, opts: { ascending: boolean }) => EqChain
    limit: (n: number) => EqChain
}
type UpdateChain = {
    eq: (col: string, val: string) => UpdateChain & Promise<{ error: { message: string } | null }>
}
type BillingRpc = {
    rpc: (
        fn: string,
        args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>
    from: (table: string) => {
        select: (columns: string) => EqChain
        update: (values: Record<string, unknown>) => UpdateChain
    }
}

function billingDb(): BillingRpc {
    return orgSupabase() as unknown as BillingRpc
}

/**
 * ¿Bloquear cuando no hay saldo? Apagado por defecto: el rollout de F5.5 es
 * measure-only primero (registrar sin bloquear) para recoger consumo real por
 * org antes de fijar precios. Encenderlo es una env var, no un deploy.
 */
export function enforcementEnabled(): boolean {
    return process.env.ENFORCE_LIMITS === 'true'
}

export type Hold = {
    /** id de la fila `token_ledger` con kind='hold'. */
    holdId: string
    tokens: number
    sku: string
    costUsd: number
    /** El hold ya existía (reintento con la misma idempotency key). */
    replayed: boolean
}

export type HoldResult =
    | { ok: true; hold: Hold; quote: Quote }
    | {
          ok: false
          reason: 'insufficient_tokens'
          available: number
          required: number
          quote: Quote
      }

/**
 * Reserva los tokens de una operación. Cobra YA y mueve el importe a
 * `held_balance`; se confirma o se devuelve después.
 *
 * Cobrar al RESERVAR y no al terminar no es un detalle: con el cobro al final,
 * N generaciones concurrentes pasan todas el chequeo con saldo para una sola.
 *
 * `idempotencyKey` es importante en las rutas de reintento (el poll de KIE
 * re-entra, el navegador re-envía): con la misma clave el segundo intento
 * devuelve el hold existente en vez de cobrar dos veces.
 */
export async function holdForOperation(
    op: PaidOperation,
    opts?: {
        ctx?: OrgContext
        idempotencyKey?: string
        refType?: string
        refId?: string
    },
): Promise<HoldResult> {
    const ctx = opts?.ctx ?? (await getOrgContext())
    const q = quote(op)

    const { data, error } = await billingDb().rpc('wallet_hold', {
        p_org: ctx.organizationId,
        p_user: ctx.userId,
        p_tokens: q.tokens,
        p_sku: q.sku,
        p_cost_usd: q.costUsd,
        p_ref_type: opts?.refType ?? null,
        p_ref_id: opts?.refId ?? null,
        p_idempotency_key: opts?.idempotencyKey ?? null,
        p_enforce: enforcementEnabled(),
    })

    if (error) {
        // Un fallo de la BD de billing NO debe impedir generar mientras el
        // enforcement esté apagado: en measure-only el ledger es observación,
        // y tirar aquí convertiría una feature de medición en una caída del
        // producto. Con enforcement encendido sí propaga (cobrar es requisito).
        if (!enforcementEnabled()) {
            console.error('[billing] wallet_hold falló (measure-only, se deja pasar):', error.message)
            return {
                ok: true,
                quote: q,
                hold: {
                    holdId: '',
                    tokens: q.tokens,
                    sku: q.sku,
                    costUsd: q.costUsd,
                    replayed: false,
                },
            }
        }
        throw new Error(`wallet_hold: ${error.message}`)
    }

    const res = (data ?? {}) as {
        ok?: boolean
        reason?: string
        hold_id?: string
        tokens?: number
        available?: number
        required?: number
        replayed?: boolean
    }

    if (!res.ok) {
        return {
            ok: false,
            reason: 'insufficient_tokens',
            available: res.available ?? 0,
            required: res.required ?? q.tokens,
            quote: q,
        }
    }

    return {
        ok: true,
        quote: q,
        hold: {
            holdId: res.hold_id ?? '',
            tokens: res.tokens ?? q.tokens,
            sku: q.sku,
            costUsd: q.costUsd,
            replayed: res.replayed === true,
        },
    }
}

/**
 * Confirma un hold. `tokensFinal` solo se pasa si resultó MÁS BARATO de lo
 * reservado (p.ej. el proveedor devolvió un clip más corto); la diferencia
 * vuelve a las bolsas de las que salió. Al alza no se re-cobra — el precio se
 * le prometió al usuario antes de generar.
 */
export async function settleHold(
    hold: Pick<Hold, 'holdId'>,
    opts?: { ctx?: OrgContext; tokensFinal?: number; costUsdFinal?: number },
): Promise<void> {
    if (!hold.holdId) return
    const ctx = opts?.ctx ?? (await getOrgContext())
    const { error } = await billingDb().rpc('wallet_settle', {
        p_org: ctx.organizationId,
        p_hold_id: hold.holdId,
        p_tokens_final: opts?.tokensFinal ?? null,
        p_cost_usd: opts?.costUsdFinal ?? null,
    })
    // Nunca tirar en el settle: el resultado YA está generado y guardado. Un
    // fallo aquí deja el hold colgado (lo barre la reconciliación) y eso es
    // mejor que reventar la respuesta y perderle el resultado al usuario.
    if (error) {
        console.error(`[billing] wallet_settle falló para ${hold.holdId}:`, error.message)
    }
}

/** Devuelve un hold entero (la tarea murió o el proveedor falló). */
export async function refundHold(
    hold: Pick<Hold, 'holdId'>,
    reason: string,
    opts?: { ctx?: OrgContext },
): Promise<void> {
    if (!hold.holdId) return
    const ctx = opts?.ctx ?? (await getOrgContext())
    const { error } = await billingDb().rpc('wallet_refund', {
        p_org: ctx.organizationId,
        p_hold_id: hold.holdId,
        p_reason: reason,
    })
    if (error) {
        console.error(`[billing] wallet_refund falló para ${hold.holdId}:`, error.message)
    }
}

/**
 * Correlaciona un hold ya creado con la tarea que acabó de lanzarse.
 *
 * Existe por un problema de ORDEN: el gate tiene que cobrar ANTES de llamar al
 * proveedor (si no, el que no tiene saldo igual gasta), pero el `taskId` con el
 * que después se liquida solo existe DESPUÉS de esa llamada. Así que el hold
 * nace sin referencia y aquí se le ata.
 *
 * Toca `ref_id`/`ref_type` de una fila del ledger append-only, que suena mal
 * pero no lo es: son campos de correlación, no importes. Ninguna cantidad se
 * modifica nunca después de escrita.
 */
export async function linkHoldToRef(
    holdId: string,
    refType: string,
    refId: string,
    ctx?: OrgContext,
): Promise<void> {
    if (!holdId) return
    const resolved = ctx ?? (await getOrgContext())
    const { error } = await billingDb()
        .from('token_ledger')
        .update({ ref_type: refType, ref_id: refId })
        .eq('id', holdId)
        .eq('organization_id', resolved.organizationId)
    if (error) {
        // No se tira: la tarea ya está lanzada y pagada. Un hold sin referencia
        // solo pierde la posibilidad de reembolso automático; abortar aquí le
        // costaría al usuario la generación entera.
        console.error(`[billing] linkHoldToRef(${holdId}):`, error.message)
    }
}

/**
 * Cómo nombra el ledger a la tarea de cada proveedor.
 *
 * Vivía como un ternario duplicado en cada barrido. Un tercer sitio que lo
 * escribiera distinto no fallaría: dejaría holds que nadie encuentra —y por
 * tanto nadie liquida ni devuelve— sin un solo error en consola.
 */
export function holdRefTypeFor(provider: string): string {
    return provider === 'mulerouter' ? 'mulerouter_task' : 'kie_task'
}

/** Mensaje de "no te alcanza" con las cifras reales, para devolver al cliente. */
export function insufficientTokensMessage(gate: {
    required: number
    available: number
}): string {
    return `Sin tokens suficientes: esta operación cuesta ${gate.required} tokens y tienes ${gate.available}. Compra un pack para continuar.`
}

/**
 * Encuentra el hold de una tarea por su REFERENCIA (p.ej. el taskId de KIE).
 *
 * POR QUÉ POR REFERENCIA Y NO POR `holdId`: las tareas async las liquida quien
 * ve el final (el persist, o la reconciliación de `pending_generations`), no
 * quien las lanzó. Devolverle el holdId al navegador para que lo mandara de
 * vuelta sería un id de cobro en manos del cliente; el taskId, en cambio, ya lo
 * tiene y no le da poder nuevo — el filtro por org lo acota a sus propios holds.
 */
export async function findHoldByRef(
    refType: string,
    refId: string,
    ctx?: OrgContext,
): Promise<{ holdId: string; tokens: number } | null> {
    const resolved = ctx ?? (await getOrgContext())
    const { data, error } = await billingDb()
        .from('token_ledger')
        .select('id, tokens')
        .eq('organization_id', resolved.organizationId)
        .eq('kind', 'hold')
        .eq('ref_type', refType)
        .eq('ref_id', refId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (error) {
        console.error(`[billing] findHoldByRef(${refType}:${refId}):`, error.message)
        return null
    }
    const row = (data ?? null) as { id: string; tokens: number } | null
    if (!row) return null
    return { holdId: row.id, tokens: Math.abs(row.tokens) }
}

/** Liquida el hold de una tarea async identificada por su referencia. */
export async function settleHoldByRef(
    refType: string,
    refId: string,
    opts?: { ctx?: OrgContext; tokensFinal?: number; costUsdFinal?: number },
): Promise<void> {
    const hold = await findHoldByRef(refType, refId, opts?.ctx)
    if (!hold) return
    await settleHold(hold, opts)
}

/** Reembolsa el hold de una tarea async que murió. */
export async function refundHoldByRef(
    refType: string,
    refId: string,
    reason: string,
    opts?: { ctx?: OrgContext },
): Promise<void> {
    const hold = await findHoldByRef(refType, refId, opts?.ctx)
    if (!hold) return
    await refundHold(hold, reason, opts)
}

export type WalletBalance = {
    includedBalance: number
    purchasedBalance: number
    heldBalance: number
    /** Lo gastable ahora mismo. */
    available: number
    periodStart: string | null
}

/** Saldo de la org del contexto — para `/settings/billing` y los avisos de la UI. */
export async function getWalletBalance(ctx?: OrgContext): Promise<WalletBalance> {
    const resolved = ctx ?? (await getOrgContext())
    const { data, error } = await billingDb()
        .from('org_wallets')
        .select('included_balance, purchased_balance, held_balance, period_start')
        .eq('organization_id', resolved.organizationId)
        .maybeSingle()

    if (error) throw new Error(`getWalletBalance: ${error.message}`)

    const row = (data ?? null) as {
        included_balance: number
        purchased_balance: number
        held_balance: number
        period_start: string | null
    } | null

    // Org sin fila de wallet = org que nunca gastó. Saldo 0, no un error: la
    // fila la crea el primer wallet_hold.
    const included = row?.included_balance ?? 0
    const purchased = row?.purchased_balance ?? 0
    return {
        includedBalance: included,
        purchasedBalance: purchased,
        heldBalance: row?.held_balance ?? 0,
        available: included + purchased,
        periodStart: row?.period_start ?? null,
    }
}

/**
 * Envuelve una operación SÍNCRONA pagada: reserva, ejecuta, y liquida o
 * reembolsa según el resultado. Para las async (submit→poll) NO sirve — ahí el
 * hold sobrevive al request y se liquida al persistir.
 */
export async function withTokens<T>(
    op: PaidOperation,
    fn: () => Promise<T>,
    opts?: { ctx?: OrgContext; idempotencyKey?: string; refType?: string; refId?: string },
): Promise<
    { success: true; data: T } | { success: false; error: string; needsTokens?: true }
> {
    const held = await holdForOperation(op, opts)
    if (!held.ok) {
        return {
            success: false,
            needsTokens: true,
            error: `Sin tokens suficientes: esta operación cuesta ${held.required} y tienes ${held.available}.`,
        }
    }
    try {
        const data = await fn()
        await settleHold(held.hold, { ctx: opts?.ctx })
        return { success: true, data }
    } catch (err) {
        await refundHold(held.hold, 'operation_threw', { ctx: opts?.ctx })
        throw err
    }
}
