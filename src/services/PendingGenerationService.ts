'use server'

/**
 * Rastro de las tareas de generación EN VUELO, para poder reclamarlas.
 *
 * El polling de KIE/MuleRouter lo conduce el NAVEGADOR (no hay webhook) y el
 * taskId solo vivía en una variable JS dentro del bucle: al desmontarse el
 * componente —navegar, recargar, cerrar la pestaña— el identificador
 * desaparecía con él. La tarea terminaba bien en el proveedor, la imagen
 * quedaba en su CDN, y nadie la guardaba jamás. Generación pagada y perdida
 * sin rastro para reclamarla.
 *
 * Se registra al CREAR la tarea y se borra al persistir el resultado, así que
 * en estado sano la tabla está casi vacía: lo que quede son huérfanas.
 *
 * Identidad SIEMPRE de la sesión (getOrgContext), nunca del cliente — mismo
 * criterio que AvatarForgeService.
 */
import { getOrgContext } from '@/lib/tenant/getOrgContext'
import { orgSupabase } from '@/lib/org/orgTable'
import {
    holdRefTypeFor,
    refundHoldByRef,
    settleHoldByRef,
} from '@/lib/billing/wallet'

export type PendingProvider = 'kie' | 'mulerouter'

export interface PendingGenerationRow {
    id: string
    provider: PendingProvider
    task_id: string
    avatar_id: string | null
    media_type: string
    prompt: string | null
    aspect_ratio: string | null
    metadata: Record<string, unknown>
    created_at: string
}

/**
 * Registra una tarea recién creada. Nunca lanza: es telemetría de rescate, y
 * un fallo aquí no debe tumbar la generación que el usuario ya pagó.
 */
export async function apiTrackPendingGeneration(params: {
    provider: PendingProvider
    taskId: string
    avatarId?: string | null
    mediaType?: string
    prompt?: string
    aspectRatio?: string
    metadata?: Record<string, unknown>
}): Promise<void> {
    try {
        const ctx = await getOrgContext()
        await orgSupabase()
            .from('pending_generations')
            .upsert(
                {
                    user_id: ctx.userId,
                    organization_id: ctx.organizationId,
                    provider: params.provider,
                    task_id: params.taskId,
                    avatar_id: params.avatarId ?? null,
                    media_type: params.mediaType ?? 'IMAGE',
                    prompt: params.prompt ?? null,
                    aspect_ratio: params.aspectRatio ?? null,
                    metadata: params.metadata ?? {},
                } as never,
                { onConflict: 'user_id,task_id' },
            )
    } catch (e) {
        console.warn('[pending] no se pudo registrar la tarea:', e)
    }
}

/**
 * Baja del rastro Y CIERRE DEL COBRO. Las dos cosas juntas porque este es el
 * único punto que sabe cómo terminó la tarea.
 *
 * POR QUÉ AQUÍ: el hold del camino submit-only lo liquidaba «el barrido», pero
 * el barrido solo recorre `pending_generations` — y esta función es justo la
 * que borra esa fila. Resultado medido antes del arreglo: 10 holds, 0 settles.
 * Peor aún en el fallo, donde la fila se borraba sin devolver nada: la tarea
 * quedaba cobrada sin entregar, y el reembolso del reconciliador
 * (`provider_task_failed`) ya no tenía a quién aplicárselo.
 */
export async function apiClearPendingGeneration(
    taskId: string,
    // OBLIGATORIO a propósito, sin default: decide si el cobro se confirma o se
    // devuelve, y un default silencioso le cobraría al cliente una generación
    // que el proveedor nunca entregó. Que sea un parámetro requerido es lo que
    // convierte ese error en un fallo de compilación en cada sitio nuevo.
    outcome: 'delivered' | 'failed',
): Promise<void> {
    try {
        const ctx = await getOrgContext()

        // El provider sale de la propia fila; sin ella no se sabe bajo qué
        // refType quedó anotado el hold, así que se prueban los dos (barato:
        // ambas ayudas salen sin tocar nada si no encuentran hold).
        const { data: row } = await orgSupabase()
            .from('pending_generations')
            .select('provider')
            .eq('user_id', ctx.userId)
            .eq('task_id', taskId)
            .maybeSingle()

        const provider = (row as { provider?: string } | null)?.provider
        const refTypes = provider
            ? [holdRefTypeFor(provider)]
            : [holdRefTypeFor('kie'), holdRefTypeFor('mulerouter')]

        // El cobro se cierra ANTES de borrar: si esto fallara, la fila
        // sobrevive y el reconciliador todavía puede arreglarlo. Al revés se
        // perdería el puntero, que es exactamente el bug que esto corrige.
        for (const refType of refTypes) {
            if (outcome === 'delivered') {
                await settleHoldByRef(refType, taskId, { ctx })
            } else {
                await refundHoldByRef(
                    refType,
                    taskId,
                    'provider_task_failed',
                    { ctx },
                )
            }
        }

        await orgSupabase()
            .from('pending_generations')
            .delete()
            .eq('user_id', ctx.userId)
            .eq('task_id', taskId)
    } catch (e) {
        console.warn('[pending] no se pudo limpiar la tarea:', e)
    }
}

/**
 * Pendientes reclamables del usuario. Se descartan las MUY viejas: KIE y
 * MuleRouter sirven el resultado desde una URL temporal, así que pasado cierto
 * punto reclamar es imposible y la fila solo estorba.
 */
const MAX_AGE_MS = 24 * 60 * 60 * 1000

export async function apiListPendingGenerations(): Promise<
    PendingGenerationRow[]
> {
    const ctx = await getOrgContext()
    const cutoff = new Date(Date.now() - MAX_AGE_MS).toISOString()
    const { data, error } = await orgSupabase()
        .from('pending_generations')
        .select('*')
        .eq('user_id', ctx.userId)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(50)
    if (error) throw error
    return (data ?? []) as unknown as PendingGenerationRow[]
}

/** Barrido de caducadas — se llama al reconciliar, sin ruido para el usuario. */
export async function apiPurgeExpiredPendingGenerations(): Promise<void> {
    try {
        const ctx = await getOrgContext()
        const cutoff = new Date(Date.now() - MAX_AGE_MS).toISOString()

        // F5.4 — antes de borrar el rastro, DEVOLVER los tokens. Una caducada
        // es una tarea que nunca entregó nada: su hold debitó el saldo y este
        // es el último momento en que se sabe a qué tarea pertenecía. Si se
        // borra la fila primero, el cobro queda huérfano y sin forma de
        // reclamarlo (no queda ni el task_id para correlacionar).
        const { data: expiring } = await orgSupabase()
            .from('pending_generations')
            .select('task_id, provider')
            .eq('user_id', ctx.userId)
            .lt('created_at', cutoff)

        for (const row of (expiring ?? []) as Array<{
            task_id: string
            provider: string
        }>) {
            await refundHoldByRef(
                holdRefTypeFor(row.provider),
                row.task_id,
                'pending_generation_expired',
                { ctx },
            )
        }

        await orgSupabase()
            .from('pending_generations')
            .delete()
            .eq('user_id', ctx.userId)
            .lt('created_at', cutoff)
    } catch (e) {
        console.warn('[pending] no se pudieron purgar las caducadas:', e)
    }
}
