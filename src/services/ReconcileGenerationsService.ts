'use server'

/**
 * Reclama las generaciones HUÉRFANAS: tareas que el proveedor completó pero
 * que nadie guardó porque el navegador dejó de sondear (navegación, recarga,
 * pestaña cerrada, equipo suspendido). Están pagadas y su imagen sigue viva
 * en el CDN del proveedor durante un rato — esto las rescata antes de que
 * caduque esa URL.
 *
 * Todo ocurre en el SERVIDOR: bajar la imagen del CDN y volver a subirla son
 * megabytes que no tienen por qué pasar por el navegador, y así el rescate no
 * depende de que la pestaña siga abierta (el mismo fallo que lo causó).
 */
import { getOrgContext } from '@/lib/tenant/getOrgContext'
import { orgSupabase } from '@/lib/org/orgTable'
import { orgStoragePath } from '@/lib/storagePaths'
import { settleHoldByRef, refundHoldByRef } from '@/lib/billing/wallet'
import { probeKieTask } from '@/services/kie/taskProbe'
import {
    checkMuleRouterImageTask,
    checkMuleRouterVideoTask,
    type MuleRouterVideoModel,
} from '@/services/MuleRouterService'
import {
    apiListPendingGenerations,
    apiPurgeExpiredPendingGenerations,
} from '@/services/PendingGenerationService'

export interface ReconcileResult {
    recovered: number
    running: number
    failed: number
    /** Motivos legibles de lo que no se pudo rescatar, para el toast. */
    notes: string[]
}

/**
 * Descarga el resultado del CDN del proveedor y lo deja en Storage.
 *
 * Distingue VÍDEO de imagen: al añadir Wan 2.6 se empezaron a registrar tareas
 * con media_type VIDEO, y guardarlas como .jpg con content-type de imagen
 * dejaba un archivo que ningún reproductor abre — un rescate que "funciona" y
 * entrega basura es peor que uno que falla.
 */
async function persistRemoteMedia(
    organizationId: string,
    url: string,
    mediaType: string,
): Promise<string> {
    const res = await fetch(url, { signal: AbortSignal.timeout(180_000) })
    if (!res.ok) {
        throw new Error(`descarga ${res.status}`)
    }
    const buffer = Buffer.from(await res.arrayBuffer())
    const isVideo = mediaType === 'VIDEO'
    // Mismo layout que el auto-save del Studio (F4.2.c: scope de org).
    const path = orgStoragePath(
        organizationId,
        isVideo ? 'videos' : 'images',
        `${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`,
    )
    const { error } = await orgSupabase()
        .storage.from('generations')
        .upload(path, buffer, {
            contentType: isVideo ? 'video/mp4' : 'image/jpeg',
            cacheControl: '3600',
            upsert: false,
        })
    if (error) throw new Error(error.message)
    return path
}

/**
 * Adapta el probe multi-familia de KIE a la forma que ya hablaban los checks
 * de MuleRouter, para que el bucle de abajo no tenga que ramificar.
 *
 * 'unknown' se trata como VIVA a propósito: antes un 404 se traducía a
 * 'failed' y la fila se borraba con reembolso, cerrando la puerta a rescatar
 * una tarea que quizá solo vive en otra familia de endpoints. Si de verdad no
 * existe, el barrido de caducadas la retira igual a las 24h — y también
 * reembolsa.
 */
function toTaskStatus(
    probe: Awaited<ReturnType<typeof probeKieTask>>,
):
    | { status: 'running' }
    | { status: 'done'; url: string }
    | { status: 'failed'; error: string } {
    if (probe.state === 'success') return { status: 'done', url: probe.urls[0] }
    if (probe.state === 'fail')
        return { status: 'failed', error: probe.error }
    return { status: 'running' }
}

export async function apiReconcilePendingGenerations(): Promise<ReconcileResult> {
    const ctx = await getOrgContext()
    const out: ReconcileResult = {
        recovered: 0,
        running: 0,
        failed: 0,
        notes: [],
    }

    const pending = await apiListPendingGenerations()
    for (const row of pending) {
        try {
            // El endpoint de consulta depende del MEDIO: preguntar por un
            // vídeo en la ruta de imagen devuelve 404 y la huérfana se
            // quedaría colgada para siempre.
            const isVideo = row.media_type === 'VIDEO'
            const status =
                row.provider === 'mulerouter'
                    ? isVideo
                        ? await checkMuleRouterVideoTask(
                              row.task_id,
                              (row.metadata?.model as MuleRouterVideoModel) ??
                                  'wan2.6-i2v',
                          )
                        : await checkMuleRouterImageTask(
                              row.task_id,
                              (row.metadata?.tier as 'max' | 'plus') ?? 'max',
                          )
                    : // El estado de KIE se pregunta por FAMILIA de endpoint:
                      // flux-kontext y gpt-4o no viven en /jobs/recordInfo, y
                      // preguntar ahí por una de ellas devolvía 404 → la
                      // huérfana se contaba como "sin rescate" con la imagen
                      // aún viva en el CDN. Ver services/kie/taskProbe.
                      toTaskStatus(await probeKieTask(row.task_id))

            // 'running' (KIE) y 'processing' (MuleRouter) son el mismo estado:
            // sigue viva, se deja en la tabla para el próximo intento.
            if (status.status !== 'done' && status.status !== 'failed') {
                out.running++
                continue
            }

            // F5.4 — la referencia con la que el ledger conoce esta tarea.
            const holdRef =
                row.provider === 'mulerouter' ? 'mulerouter_task' : 'kie_task'

            if (status.status === 'failed') {
                out.failed++
                // El proveedor no entregó nada → no se le cobra al cliente.
                // Sin esto, una tarea fallida se queda cobrada para siempre: el
                // hold ya debitó el saldo y nadie lo devuelve.
                await refundHoldByRef(
                    holdRef,
                    row.task_id,
                    'provider_task_failed',
                    { ctx },
                )
                await orgSupabase()
                    .from('pending_generations')
                    .delete()
                    .eq('id', row.id)
                continue
            }

            const path = await persistRemoteMedia(
                ctx.organizationId,
                status.url,
                row.media_type,
            )
            await orgSupabase()
                .from('generations')
                .insert({
                    user_id: ctx.userId,
                    organization_id: ctx.organizationId,
                    avatar_id: row.avatar_id,
                    media_type: row.media_type,
                    storage_path: path,
                    prompt: row.prompt,
                    aspect_ratio: row.aspect_ratio,
                    metadata: {
                        ...row.metadata,
                        // Marca de origen: se rescató, no se generó en vivo.
                        recovered: true,
                        recoveredFrom: row.provider,
                        // El id del proveedor, para poder responder después a
                        // "esta tarea terminó allí, ¿dónde está aquí?".
                        // `generations` no tiene columna task_id, así que esta
                        // marca es la ÚNICA forma de correlacionarlas.
                        kieTaskId:
                            row.provider === 'kie' ? row.task_id : undefined,
                        providerTaskId: row.task_id,
                    },
                } as never)
            // Rescatada y guardada: el cobro es legítimo, se cierra el hold.
            await settleHoldByRef(holdRef, row.task_id, { ctx })
            await orgSupabase()
                .from('pending_generations')
                .delete()
                .eq('id', row.id)
            out.recovered++
        } catch (e) {
            // Una huérfana irrecuperable no debe abortar el barrido: lo más
            // común es que su URL del CDN ya caducó, y las demás sí sirven.
            out.failed++
            out.notes.push(
                `${row.provider}/${row.task_id.slice(0, 8)}: ${
                    e instanceof Error ? e.message : 'error'
                }`,
            )
        }
    }

    await apiPurgeExpiredPendingGenerations()
    return out
}
