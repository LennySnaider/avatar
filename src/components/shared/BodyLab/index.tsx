'use client'

import { HiOutlineEye, HiOutlineRefresh } from 'react-icons/hi'

/**
 * Body Lab — Cuerpo canónico. Extraído de PhysicalAttributesEditor (antes un
 * bloque `{bodyLab && (...)}` embebido ahí) para poder renderizarlo donde el
 * host quiera (los drawers ahora lo ponen justo debajo de Specific
 * References — cara/ángulos — en vez de al fondo de Physical Attributes).
 * Componente `value + onChange` puro: el host inyecta toda la lógica de
 * generación/persistencia vía props; este componente solo pinta.
 */

// Forma mínima compartida de un ref de región (bust/glutes/body). Estructuralmente
// compatible con el ReferenceImage del Studio (que trae 'bust'|'glutes'|'body' en
// `type`); los hosts castean al setear si su tipo local es más estricto.
export interface PhysicalRegionRef {
    id?: string
    url: string
    mimeType: string
    base64: string
    type?: string
    storagePath?: string
    thumbnailUrl?: string
}

// Props del bloque "Body Lab". El host inyecta la lógica de
// generación/persistencia; este componente solo pinta.
export interface BodyLabProps {
    // Modelos permisivos a elegir. `model` es la cadena que va a generateImageKie.
    models: { id: string; name: string; model: string }[]
    selectedModel: string // cadena `model` seleccionada
    onSelectModel: (model: string) => void
    isGenerating: boolean
    sheet: PhysicalRegionRef | null // preview del sheet generado
    sheetModel?: string // nombre del modelo con que se generó el sheet (badge)
    onGenerate: () => void
    onUseAsBody: () => void
    // true si hay una generación FRESCA para fijar (sin esto, el botón "Usar
    // como cuerpo" no aplica — solo se está viendo el cuerpo ya guardado).
    canUseAsBody?: boolean
    // Click en el preview → abrir en grande (el host usa su propio lightbox).
    // Si no se pasa, el preview no es clickeable.
    onPreview?: () => void
    // Motivo por el que no se puede generar (sin faceRef / sin modelo permisivo).
    // Si está presente, el botón "Generar cuerpo" se deshabilita y se muestra.
    disabledReason?: string
    // true si los atributos físicos cambiaron desde que se generó/guardó el
    // sheet mostrado → overlay "desactualizado" + botón Actualizar + ojo.
    stale?: boolean
}

const BodyLab = (props: BodyLabProps) => {
    return (
        <div className="space-y-3">
            <div>
                <p className="text-sm font-semibold">
                    Body Lab — Cuerpo canónico
                </p>
                <p className="text-xs text-gray-500">
                    Genera un cuerpo de 3 vistas (mini-bikini) desde estos
                    atributos y fíjalo como el cuerpo del avatar.
                </p>
            </div>

            <div className="space-y-1">
                <label className="text-xs text-gray-500">
                    Modelo de generación
                </label>
                <select
                    className="w-full h-9 px-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent text-sm"
                    value={props.selectedModel}
                    onChange={(e) => props.onSelectModel(e.target.value)}
                    disabled={props.models.length === 0 || props.isGenerating}
                >
                    {props.models.length === 0 ? (
                        <option value="">
                            Sin modelo KIE configurado
                        </option>
                    ) : (
                        props.models.map((m) => (
                            <option key={m.id} value={m.model}>
                                {m.name}
                            </option>
                        ))
                    )}
                </select>
            </div>

            {props.sheet && (
                <div className="relative">
                    <img
                        src={props.sheet.thumbnailUrl || props.sheet.url}
                        alt="Body angle sheet"
                        onClick={props.stale ? undefined : props.onPreview}
                        className={`w-full rounded-lg border border-gray-200 dark:border-gray-700 object-cover transition-all${
                            props.stale ? ' opacity-40' : ''
                        }${
                            props.onPreview && !props.stale
                                ? ' cursor-pointer hover:ring-2 hover:ring-primary'
                                : ''
                        }`}
                    />
                    {props.sheetModel && !props.stale && (
                        <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/70 text-white text-[10px] font-medium backdrop-blur-sm pointer-events-none">
                            {props.sheetModel}
                        </span>
                    )}
                    {/* Overlay "desactualizado": cambiaste atributos → actualizar */}
                    {props.stale && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 backdrop-blur-[1px] rounded-lg">
                            <span className="text-xs text-white text-center px-3">
                                Cambiaste los atributos — este cuerpo está
                                desactualizado
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={props.onGenerate}
                                    disabled={props.isGenerating}
                                    className="flex items-center gap-1 px-3 h-8 rounded-lg bg-primary text-white text-xs disabled:opacity-50"
                                >
                                    <HiOutlineRefresh className="w-3.5 h-3.5" />
                                    {props.isGenerating
                                        ? 'Generando…'
                                        : 'Actualizar'}
                                </button>
                                {props.onPreview && (
                                    <button
                                        type="button"
                                        onClick={props.onPreview}
                                        title="Ver imagen actual"
                                        className="flex items-center justify-center h-8 w-8 rounded-lg bg-white/20 text-white hover:bg-white/30"
                                    >
                                        <HiOutlineEye className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={props.onGenerate}
                    disabled={!!props.disabledReason || props.isGenerating}
                    className="flex-1 h-9 rounded-lg bg-primary text-white text-sm disabled:opacity-50"
                >
                    {props.isGenerating
                        ? 'Generando…'
                        : props.sheet
                          ? 'Regenerar cuerpo'
                          : 'Generar cuerpo'}
                </button>
                {props.canUseAsBody && !props.isGenerating && (
                    <button
                        type="button"
                        onClick={props.onUseAsBody}
                        className="flex-1 h-9 rounded-lg border border-primary text-primary text-sm"
                    >
                        Usar como cuerpo
                    </button>
                )}
            </div>

            {props.disabledReason && (
                <p className="text-xs text-amber-500">{props.disabledReason}</p>
            )}
        </div>
    )
}

export default BodyLab
