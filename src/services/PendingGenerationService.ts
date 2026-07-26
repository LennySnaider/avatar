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

/** Baja del rastro: la tarea ya se persistió (o falló de forma terminal). */
export async function apiClearPendingGeneration(taskId: string): Promise<void> {
    try {
        const ctx = await getOrgContext()
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
        await orgSupabase()
            .from('pending_generations')
            .delete()
            .eq('user_id', ctx.userId)
            .lt('created_at', cutoff)
    } catch (e) {
        console.warn('[pending] no se pudieron purgar las caducadas:', e)
    }
}
