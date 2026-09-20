/**
 * Resuelve las dependencias reales de `runJob` y `sweep`: Supabase, R2, el
 * servicio limpiador y el monedero.
 *
 * Aparte de la lógica a propósito: `runJob.ts` es una máquina de estados pura
 * con todo inyectado, y por eso se puede probar entera sin levantar nada.
 */
import { chargeTokens } from '@/lib/billing/wallet'
import { isBillingExempt } from '@/lib/billing/exemption'
import {
    createPresignedGetUrl,
    createPresignedPutUrl,
    deleteMediaObject,
} from '@/lib/mediaStore'
import { orgSupabase } from '@/lib/org/orgTable'

import { clienteDesdeEntorno } from './client'
import { ejecutarTrabajo, MS_PARA_RETOMAR_TOMADA_EN_RUNJOB } from './runJob'
import type { Dependencias, FilaGeneracion } from './runJob'
import type { DesenlaceTrabajo, EstadoAiMarks, EstadoPersistido } from './types'

/** Minutos de vida de las URLs firmadas. Cubre el peor vídeo medido con holgura. */
const VENTANA_FIRMA_S = 30 * 60

interface FilaCruda {
    id: string
    organization_id: string
    user_id: string | null
    media_type: string
    storage_path: string
    thumbnail_path: string | null
    ai_marks_status: string
    ai_marks: EstadoPersistido | null
    metadata: { providerName?: string; model?: string } | null
}

function aFila(cruda: FilaCruda): FilaGeneracion {
    return {
        id: cruda.id,
        organizationId: cruda.organization_id,
        userId: cruda.user_id,
        mediaType: cruda.media_type === 'VIDEO' ? 'VIDEO' : 'IMAGE',
        storagePath: cruda.storage_path,
        thumbnailPath: cruda.thumbnail_path,
        estado: cruda.ai_marks_status as EstadoAiMarks,
        aiMarks: cruda.ai_marks,
        // El proveedor es lo que evita el falso positivo del detector. Sin él
        // el motor escanea las siete marcas y puede rellenar píxeles buenos.
        proveedor: cruda.metadata?.providerName ?? cruda.metadata?.model ?? null,
    }
}

/**
 * Construye las dependencias. Devuelve el motivo exacto si el módulo no está
 * configurado, en vez de un nulo que obligaría a quien llama a adivinar.
 */
export function dependenciasReales():
    | { ok: true; deps: Dependencias }
    | { ok: false; error: string } {
    const cliente = clienteDesdeEntorno()
    if (!cliente.ok) return cliente

    const deps: Dependencias = {
        /**
         * Toma la fila con un UPDATE CONDICIONAL, no con un SELECT seguido de
         * UPDATE: dos barridos solapados leerían la misma fila `pending` y la
         * limpiarían dos veces, cobrándola dos veces. La condición incluye las
         * filas `running` abandonadas hace rato, que es como se recupera una
         * función que murió a mitad.
         */
        async tomar(generationId, ahora) {
            const limite = new Date(
                ahora.getTime() - MS_PARA_RETOMAR_TOMADA_EN_RUNJOB,
            ).toISOString()
            const { data, error } = await orgSupabase()
                .from('generations')
                .update({ ai_marks_status: 'running' } as never)
                .eq('id', generationId)
                .or(
                    `ai_marks_status.eq.pending,and(ai_marks_status.eq.running,ai_marks->>tomadaEn.lt.${limite})`,
                )
                .select(
                    'id, organization_id, user_id, media_type, storage_path, thumbnail_path, ai_marks_status, ai_marks, metadata',
                )
                .maybeSingle()
            if (error) throw new Error(error.message)
            return data ? aFila(data as unknown as FilaCruda) : null
        },

        async guardar(generationId, cambios) {
            const fila: Record<string, unknown> = {
                ai_marks_status: cambios.estado,
                ai_marks: cambios.aiMarks,
            }
            if (cambios.storagePath) fila.storage_path = cambios.storagePath
            if (cambios.thumbnailPath !== undefined) fila.thumbnail_path = cambios.thumbnailPath
            const { data, error } = await orgSupabase()
                .from('generations')
                .update(fila as never)
                .eq('id', generationId)
                .select('id')
            if (error) throw new Error(error.message)
            return { filasAfectadas: (data ?? []).length }
        },

        urlLectura: (ruta) => createPresignedGetUrl(ruta, VENTANA_FIRMA_S),
        urlEscritura: (ruta) => createPresignedPutUrl(ruta, VENTANA_FIRMA_S),

        async borrarObjeto(ruta) {
            await deleteMediaObject({ path: ruta, provider: 'r2' })
        },

        cliente: cliente.cliente,

        async cobrar(entrada) {
            // Una organización exenta no genera asiento NINGUNO: es la
            // invariante que documenta `exemption.ts`.
            if (await isBillingExempt(entrada.organizationId)) return { tokens: 0 }
            const resultado = await chargeTokens({
                organizationId: entrada.organizationId,
                userId: entrada.userId,
                tokens: entrada.tokens,
                sku: entrada.sku,
                refType: 'generation',
                refId: entrada.generationId,
                idempotencyKey: entrada.idempotencyKey,
                costUsd: entrada.costUsd,
                metadata: {
                    visiblesRemovidas: entrada.informe.visibles
                        .filter((m) => m.estado === 'removida')
                        .map((m) => m.etiqueta),
                    metadatosRemovidos: entrada.informe.metadatos.removidos,
                    backend: entrada.informe.backend,
                    versionMotor: entrada.informe.versionMotor,
                    duracionMs: entrada.informe.duracionMs,
                },
            })
            return resultado.ok ? { tokens: resultado.tokens } : { error: resultado.reason }
        },

        ahora: () => new Date(),
        registrar: (mensaje, error) => {
            if (error) console.error(mensaje, error)
            else console.error(mensaje)
        },
    }
    return { ok: true, deps }
}

/** Ejecuta el trabajo con las dependencias reales. Nunca lanza. */
export async function limpiarGeneracion(generationId: string): Promise<DesenlaceTrabajo> {
    const construidas = dependenciasReales()
    if (!construidas.ok) {
        console.error(`[aiMarks] ${generationId} sin configurar: ${construidas.error}`)
        return { estado: 'fallido', intentos: 0, error: construidas.error }
    }
    try {
        return await ejecutarTrabajo(generationId, construidas.deps)
    } catch (err) {
        // Nunca se pierde una generación por un fallo del limpiador: la fila
        // sigue sirviendo el original y el barrido la reintentará.
        console.error(`[aiMarks] ${generationId} trabajo reventó`, err)
        return { estado: 'fallido', intentos: 0, error: String(err) }
    }
}
