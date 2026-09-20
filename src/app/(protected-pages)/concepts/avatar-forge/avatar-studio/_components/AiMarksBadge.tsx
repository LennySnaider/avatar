'use client'

import { chipParaGeneracion } from '@/lib/aiMarks/presentation'
import type { EstadoAiMarks, EstadoPersistido } from '@/lib/aiMarks/types'

/**
 * Chip que dice si a este archivo se le quitaron las marcas de IA.
 *
 * La decisión de QUÉ pintar vive en `presentation.ts`, que es puro y está
 * probado: aquí sólo se eligen colores. Así el diálogo de publicación puede
 * usar la misma regla sin duplicarla.
 */
const MOTIVOS: Record<string, string> = {
    modulo_apagado: 'el módulo de limpieza no está instalado',
    ajuste_apagado: 'la limpieza está apagada para este tipo de archivo',
    formato_no_soportado: 'el formato no se puede limpiar',
    almacenamiento_no_r2: 'el archivo no está en el almacén que limpia',
    ya_limpia: 'ya estaba limpio',
}

export default function AiMarksBadge({
    estado,
    aiMarks,
    onReintentar,
    reintentando,
}: {
    estado?: string
    aiMarks?: Record<string, unknown> | null
    onReintentar?: () => void
    reintentando?: boolean
}) {
    const chip = chipParaGeneracion(
        estado as EstadoAiMarks | undefined,
        (aiMarks as EstadoPersistido | null) ?? null,
        Date.now(),
    )
    if (chip.tipo === 'ninguno') return null

    const base = 'px-2 py-1 text-[10px] font-medium rounded inline-block'

    if (chip.tipo === 'limpio') {
        return (
            <span
                className={`${base} bg-emerald-500 text-white`}
                title={
                    chip.removidas.length
                        ? `Sin marcas de IA · se quitó: ${chip.removidas.join(', ')}`
                        : 'Sin marcas de IA'
                }
            >
                ✓ Limpio
            </span>
        )
    }

    if (chip.tipo === 'parcial') {
        return (
            <span
                className={`${base} bg-amber-500 text-white`}
                title={`Quedó algo: ${chip.sobrevivientes.join(', ')}${
                    chip.removidas.length ? ` · se quitó: ${chip.removidas.join(', ')}` : ''
                }`}
            >
                ⚠ Parcial
            </span>
        )
    }

    if (chip.tipo === 'limpiando') {
        return (
            <span className={`${base} bg-sky-500 text-white`} title="Quitando marcas de IA">
                Limpiando…
            </span>
        )
    }

    if (chip.tipo === 'fallido') {
        return (
            <span className="inline-flex items-center gap-1">
                <span className={`${base} bg-red-500 text-white`} title={chip.error}>
                    ✗ Sin limpiar
                </span>
                {onReintentar && (
                    <button
                        type="button"
                        disabled={reintentando}
                        className={`${base} bg-black/70 text-white disabled:opacity-60`}
                        onClick={(e) => {
                            // La tarjeta entera abre el visor; este botón no.
                            e.stopPropagation()
                            onReintentar()
                        }}
                    >
                        {reintentando ? 'Reintentando…' : 'Reintentar'}
                    </button>
                )}
            </span>
        )
    }

    if (chip.tipo === 'sin_modulo') {
        return (
            <span
                className={`${base} bg-gray-400/80 text-white`}
                title={`No se limpió: ${MOTIVOS[chip.motivo] ?? chip.motivo}`}
            >
                — Sin limpiar
            </span>
        )
    }

    // `sin_marcas`: el archivo ya venía sin nada que quitar. No se pinta chip
    // de color para no llenar la tarjeta de sellos verdes que no informan.
    return (
        <span
            className={`${base} bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300`}
            title="El archivo no traía marcas de IA"
        >
            Sin marcas
        </span>
    )
}
