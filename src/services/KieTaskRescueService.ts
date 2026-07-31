'use server'

/**
 * Rescate MANUAL de una tarea de KIE por su taskId.
 *
 * POR QUÉ EXISTE: el reconciliador automático solo ve lo que está en
 * `pending_generations`, y hay caminos de generación que NUNCA registran la
 * tarea ahí — todo lo que pasa por el poll SÍNCRONO de `generateImageKie`
 * (modelos no-async: flux-kontext, gpt-4o-image; el Body Lab; la edición con
 * esos modelos). En esos casos el taskId nace y muere DENTRO de la función de
 * servidor: si la función se corta antes de terminar el poll —el presupuesto
 * son 600s y el maxDuration por defecto de Vercel es menor— la tarea sigue
 * corriendo en KIE, termina bien, y en la app no queda ni rastro del id.
 *
 * Tampoco hay forma de buscar por taskId a posteriori: `generations` no guarda
 * esa columna, así que ni siquiera se puede comprobar "¿esta ya se guardó?".
 *
 * Esto cierra las dos cosas: `apiInspectKieTask` DICE qué pasó con un id
 * (en KIE y en nuestra base), y `apiRescueKieTask` baja el resultado y lo mete
 * en la galería. Las filas rescatadas quedan marcadas con `kieTaskId` en su
 * metadata para que la próxima búsqueda por id sí tenga respuesta.
 */
import { getOrgContext } from '@/lib/tenant/getOrgContext'
import { orgSupabase } from '@/lib/org/orgTable'
import { orgStoragePath } from '@/lib/storagePaths'
import { settleHoldByRef, findHoldByRef } from '@/lib/billing/wallet'
import { probeKieTask, type KieTaskFamily } from '@/services/kie/taskProbe'

export interface KieTaskDiagnosis {
    taskId: string
    /** Estado en KIE. 'unknown' = ninguna familia de endpoints lo reconoce. */
    kieState: 'running' | 'success' | 'fail' | 'unknown'
    /** Familia de endpoint donde vive (dice de qué modelo salió). */
    family: KieTaskFamily | null
    model?: string
    /** URLs del CDN de KIE cuando terminó bien (caducan: rescatar pronto). */
    urls: string[]
    /** Mensaje de KIE cuando falló, o de por qué no se pudo consultar. */
    error?: string
    /** ¿Está en el rastro de reclamables? (lo que ve el botón de reconciliar) */
    tracked: boolean
    /** ¿Ya existe una fila de `generations` marcada con este taskId? */
    alreadySaved: boolean
    generationId?: string
    /** ¿Quedó un hold vivo en el ledger? (la generación se cobró y no se cerró) */
    hasOpenHold: boolean
    /** Lectura en una frase de todo lo anterior. */
    verdict: string
}

/** Busca una fila de `generations` que ya lleve marcado este taskId. */
async function findSavedGeneration(
    organizationId: string,
    taskId: string,
): Promise<string | null> {
    const { data } = await orgSupabase()
        .from('generations')
        .select('id')
        .eq('organization_id', organizationId)
        // Marca que ponen el rescate y el reconciliador. Las generaciones
        // guardadas por el camino normal NO la tienen todavía, así que un
        // `false` aquí no prueba que no esté en la galería — solo que no se
        // puede correlacionar por id.
        .filter('metadata->>kieTaskId', 'eq', taskId)
        .limit(1)
        .maybeSingle()
    return (data as { id: string } | null)?.id ?? null
}

/**
 * Diagnóstico de un taskId: qué dice KIE y qué sabemos nosotros. No modifica
 * nada — es la respuesta a "esto terminó bien en KIE, ¿por qué no lo veo?".
 */
export async function apiInspectKieTask(
    taskId: string,
): Promise<KieTaskDiagnosis> {
    const ctx = await getOrgContext()
    const clean = taskId.trim()

    const probe = await probeKieTask(clean)

    const { data: pendingRow } = await orgSupabase()
        .from('pending_generations')
        .select('id')
        .eq('organization_id', ctx.organizationId)
        .eq('task_id', clean)
        .limit(1)
        .maybeSingle()

    const generationId = await findSavedGeneration(ctx.organizationId, clean)
    const hold = await findHoldByRef('kie_task', clean, ctx)

    const out: KieTaskDiagnosis = {
        taskId: clean,
        kieState: probe.state,
        family: probe.family,
        model: 'model' in probe ? probe.model : undefined,
        urls: probe.state === 'success' ? probe.urls : [],
        error:
            probe.state === 'fail' || probe.state === 'unknown'
                ? probe.error
                : undefined,
        tracked: Boolean(pendingRow),
        alreadySaved: Boolean(generationId),
        generationId: generationId ?? undefined,
        hasOpenHold: Boolean(hold),
        verdict: '',
    }
    out.verdict = explainDiagnosis(out)
    return out
}

/** Traduce el diagnóstico a la frase que responde "¿por qué no la veo?". */
function explainDiagnosis(d: KieTaskDiagnosis): string {
    if (d.kieState === 'unknown') {
        return `KIE no reconoce este taskId con la API key configurada. Comprueba que el id sea el de la tarea (no el de la generación) y que sea de esta cuenta de KIE. ${d.error ?? ''}`.trim()
    }
    if (d.kieState === 'running') {
        return 'La tarea SIGUE corriendo en KIE. No aparece porque todavía no ha terminado — vuelve a comprobar en un rato.'
    }
    if (d.kieState === 'fail') {
        return `La tarea FALLÓ en KIE (${d.error ?? 'sin mensaje'}), así que no hay nada que guardar.`
    }
    if (d.alreadySaved) {
        return 'La tarea terminó bien y su imagen YA está guardada en la galería (fila ' + d.generationId + ').'
    }
    if (d.tracked) {
        return 'Terminó bien en KIE y está en el rastro de reclamables, pero nadie la guardó todavía: el botón de reconciliar (o "Rescatar") la baja a la galería.'
    }
    return 'Terminó bien en KIE pero NUNCA se registró en el rastro de reclamables, por eso el reconciliador automático no la ve: el taskId se creó y se perdió dentro de la función de servidor (camino de poll síncrono). Con "Rescatar" se baja igualmente mientras la URL del CDN de KIE siga viva.'
}

/** Baja el resultado del CDN de KIE y lo deja en Storage (mismo layout que el
 *  auto-save del Studio y que el reconciliador). */
async function persistRemoteMedia(
    organizationId: string,
    url: string,
    isVideo: boolean,
): Promise<string> {
    const res = await fetch(url, { signal: AbortSignal.timeout(180_000) })
    if (!res.ok) {
        throw new Error(
            `No se pudo bajar el resultado de KIE (${res.status}). Si la tarea es de hace horas, su URL del CDN ya caducó y la imagen es irrecuperable.`,
        )
    }
    const buffer = Buffer.from(await res.arrayBuffer())
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

export interface RescueResult {
    success: boolean
    /** Fila creada en `generations` (o la que ya existía). */
    generationId?: string
    message: string
}

/**
 * Baja el resultado de un taskId terminado y lo mete en la galería.
 *
 * Idempotente por la marca `metadata.kieTaskId`: pedir el rescate dos veces del
 * mismo id no crea dos filas (y no vuelve a pagar el tráfico de la descarga).
 */
export async function apiRescueKieTask(params: {
    taskId: string
    avatarId?: string | null
    prompt?: string
    aspectRatio?: string
    mediaType?: 'IMAGE' | 'VIDEO'
}): Promise<RescueResult> {
    const ctx = await getOrgContext()
    const taskId = params.taskId.trim()
    if (!taskId) return { success: false, message: 'Falta el taskId.' }

    const existing = await findSavedGeneration(ctx.organizationId, taskId)
    if (existing) {
        return {
            success: true,
            generationId: existing,
            message: 'Esta tarea ya estaba rescatada — no se duplica.',
        }
    }

    const probe = await probeKieTask(taskId)
    if (probe.state !== 'success') {
        return {
            success: false,
            message:
                probe.state === 'running'
                    ? 'La tarea todavía está generando en KIE.'
                    : probe.state === 'fail'
                      ? `La tarea falló en KIE: ${probe.error}`
                      : probe.error,
        }
    }

    // El medio no viene en el probe: se deduce de la URL salvo que el llamante
    // lo sepa (el rescate manual casi siempre es de imagen).
    const url = probe.urls[0]
    const isVideo =
        params.mediaType === 'VIDEO' || /\.(mp4|mov|webm)(\?|$)/i.test(url)

    try {
        const path = await persistRemoteMedia(ctx.organizationId, url, isVideo)
        const { data, error } = await orgSupabase()
            .from('generations')
            .insert({
                user_id: ctx.userId,
                organization_id: ctx.organizationId,
                avatar_id: params.avatarId ?? null,
                media_type: isVideo ? 'VIDEO' : 'IMAGE',
                storage_path: path,
                // `generations.prompt` es NOT NULL y el rescate manual no
                // recibe prompt: insertar null reventaba con "null value in
                // column prompt" DESPUÉS de haber bajado y guardado el archivo
                // — el peor momento, porque el trabajo ya estaba hecho.
                // El prompt real se recupera del `param` que guarda KIE; el
                // texto de respaldo solo entra si su formato cambió, y es
                // preferible a perder el rescate por un campo descriptivo.
                prompt:
                    params.prompt ??
                    probe.prompt ??
                    `[rescatada de KIE · ${taskId}]`,
                aspect_ratio: params.aspectRatio ?? null,
                metadata: {
                    recovered: true,
                    recoveredFrom: 'kie',
                    recoveredManually: true,
                    // La marca que hace BUSCABLE la fila por taskId — sin ella
                    // el mismo problema se repite con la siguiente tarea.
                    kieTaskId: taskId,
                    kieFamily: probe.family,
                    ...(probe.model ? { model: probe.model } : {}),
                },
            } as never)
            .select('id')
            .single()
        if (error) throw new Error(error.message)

        // El cobro es legítimo: entregó media. Se cierra el hold si quedaba
        // abierto (el camino síncrono lo liquida solo cuando la función vive
        // hasta el final — justo lo que aquí no pasó).
        await settleHoldByRef('kie_task', taskId, { ctx })
        // Y fuera del rastro de reclamables, si estaba.
        await orgSupabase()
            .from('pending_generations')
            .delete()
            .eq('organization_id', ctx.organizationId)
            .eq('task_id', taskId)

        return {
            success: true,
            generationId: (data as { id: string } | null)?.id,
            message: 'Generación rescatada y guardada en la galería.',
        }
    } catch (e) {
        return {
            success: false,
            message: e instanceof Error ? e.message : 'Error al rescatar',
        }
    }
}
