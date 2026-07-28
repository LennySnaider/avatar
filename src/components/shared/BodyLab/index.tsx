'use client'

import { useEffect, useState } from 'react'
import { HiOutlineEye, HiOutlineRefresh } from 'react-icons/hi'
import Alert from '@/components/ui/Alert'

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
    // Variante NUDE de la hoja (se genera en pareja con la vestida). Solo viaja
    // a motores permisivos en runs NSFW; aquí se muestra como miniatura para
    // confirmar que existe. null = este avatar no tiene variante NSFW.
    nudeSheet?: PhysicalRegionRef | null
    // Click en la miniatura NSFW → lightbox del host.
    onPreviewNude?: () => void
    // Regenera SOLO una variante (evita pagar las dos). Si no se pasa, no se
    // muestran los botones de refresh por hoja.
    onRegenerate?: (only: 'clothed' | 'nude') => void
    // La BD dice que este avatar TIENE hoja pero el archivo no se pudo cargar.
    // Sin esto el panel se pinta igual que "nunca se generó" y el usuario no
    // puede saber si su hoja se guardó, si se perdió, o si viaja a la
    // generación (reporte: "no lo muestra… y no sé si sí le envié realmente").
    // Un fallo silencioso que se parece a un estado vacío legítimo es
    // indistinguible de un bug: hay que nombrarlo.
    missingSheetNotice?: string
}

/**
 * Texto del aviso "la BD dice que hay hoja, el archivo no está". Vive aquí y no
 * en cada drawer porque son DOS hosts (Studio y My Avatars) y dos copias del
 * mismo mensaje divergen: uno se actualiza y el otro miente.
 * Devuelve undefined cuando no hay nada que avisar, para pasarlo tal cual.
 */
export function buildMissingSheetNotice(
    missing: ('body' | 'body_nsfw')[],
): string | undefined {
    if (missing.length === 0) return undefined
    const cuales =
        missing.length === 2
            ? 'sus dos hojas'
            : missing[0] === 'body_nsfw'
              ? 'su hoja NSFW'
              : 'su hoja de cuerpo'
    // Se dice explícitamente lo que el usuario no podía saber: que mientras
    // tanto la generación sale SIN cuerpo (solo medidas en texto).
    return `Este avatar tenía ${cuales} guardadas, pero el archivo ya no está disponible. Mientras tanto el cuerpo NO viaja a la generación (solo las medidas en texto): vuelve a generarlo aquí para recuperarlo.`
}

/** Overlay de "generando" sobre una hoja. Sin esto la miniatura se quedaba
 *  idéntica durante todo el request (30-90s) y el único feedback era el botón
 *  de refresh atenuado: parecía que el click no había hecho nada y el usuario
 *  volvía a pulsar (= pagar dos veces). */
const GeneratingOverlay = ({ compact }: { compact?: boolean }) => (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/60 backdrop-blur-[2px] rounded-lg z-10">
        <HiOutlineRefresh
            className={`animate-spin text-white ${compact ? 'w-4 h-4' : 'w-6 h-6'}`}
        />
        {!compact && (
            <span className="text-xs text-white">Generando…</span>
        )}
    </div>
)

const BodyLab = (props: BodyLabProps) => {
    // QUÉ hoja se está regenerando. El host solo expone un `isGenerating`
    // global, así que sin esto un refresh de la NSFW bloquearía también la
    // vestida (y al revés). null = generación completa → bloquea ambas.
    const [pending, setPending] = useState<'clothed' | 'nude' | null>(null)
    const { isGenerating } = props
    useEffect(() => {
        if (!isGenerating) setPending(null)
    }, [isGenerating])

    // El aviso pide "no recargues la página"; esto lo respalda. Sin
    // pending_generations detrás, un F5 a mitad de camino tira una generación
    // ya cobrada, y eso es demasiado caro para confiarlo solo a que el usuario
    // lea. Se engancha SOLO mientras se genera.
    useEffect(() => {
        if (!isGenerating) return
        const avisar = (e: BeforeUnloadEvent) => e.preventDefault()
        window.addEventListener('beforeunload', avisar)
        return () => window.removeEventListener('beforeunload', avisar)
    }, [isGenerating])

    const busyClothed = isGenerating && pending !== 'nude'
    const busyNude = isGenerating && pending !== 'clothed'

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
                    {/* Refresh SOLO de la vestida (no paga la nude). */}
                    {props.onRegenerate && !props.stale && (
                        <button
                            type="button"
                            disabled={props.isGenerating}
                            title="Regenerar SOLO esta hoja (vestida)"
                            onClick={(e) => {
                                e.stopPropagation()
                                setPending('clothed')
                                props.onRegenerate?.('clothed')
                            }}
                            className="absolute top-2 right-2 flex items-center justify-center h-7 w-7 rounded-lg bg-black/60 text-white hover:bg-black/80 disabled:opacity-40"
                        >
                            <HiOutlineRefresh className="w-4 h-4" />
                        </button>
                    )}
                    {busyClothed && <GeneratingOverlay />}
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
                                    onClick={() => {
                                        setPending(null)
                                        props.onGenerate()
                                    }}
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

            {/* Variante NSFW: miniatura pequeña (la hoja de trabajo es la
                vestida; esta solo confirma que el avatar tiene versión nude). */}
            {props.nudeSheet && !props.stale && (
                <div className="flex items-center gap-2">
                    <div className="relative shrink-0">
                        <img
                            src={
                                props.nudeSheet.thumbnailUrl ||
                                props.nudeSheet.url
                            }
                            alt="Body sheet NSFW"
                            onClick={props.onPreviewNude}
                            className={`h-14 w-24 rounded-md border border-pink-500/40 object-cover${
                                props.onPreviewNude
                                    ? ' cursor-pointer hover:ring-2 hover:ring-pink-500'
                                    : ''
                            }`}
                        />
                        <span className="absolute top-0.5 left-0.5 px-1 rounded bg-pink-600 text-white text-[9px] font-bold pointer-events-none">
                            🌶️
                        </span>
                        {busyNude && <GeneratingOverlay compact />}
                        {/* Refresh SOLO de la NSFW (no paga la vestida). */}
                        {props.onRegenerate && (
                            <button
                                type="button"
                                disabled={props.isGenerating}
                                title="Regenerar SOLO la variante NSFW"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setPending('nude')
                                    props.onRegenerate?.('nude')
                                }}
                                className="absolute -top-1.5 -right-1.5 flex items-center justify-center h-6 w-6 rounded-full bg-pink-600 text-white hover:bg-pink-700 disabled:opacity-40 shadow"
                            >
                                <HiOutlineRefresh className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                    <p className="text-[10px] text-gray-400 leading-snug">
                        Variante NSFW lista — se usa sola en generaciones 🌶️ con
                        motores permisivos (la vestida va al resto).
                    </p>
                </div>
            )}

            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={() => {
                        setPending(null)
                        props.onGenerate()
                    }}
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

            {/* AVISO DE ESPERA: el body sheet NO pasa por pending_generations
                (eso es solo la galería del Studio), así que si el usuario cierra
                el drawer a mitad de camino, el resultado se descarta aunque KIE
                ya lo haya cobrado. Y desde que las hojas se generan ENCADENADAS
                (nude → vestida) la espera es del doble, así que el silencio de
                antes ya no alcanzaba: hay que decir cuánto tarda y por qué. */}
            {props.isGenerating && (
                <Alert type="info" showIcon className="text-xs">
                    <span className="font-semibold">
                        No cierres este panel ni recargues la página.
                    </span>{' '}
                    {pending
                        ? 'Estamos generando la hoja; suele tardar entre 30 y 90 segundos.'
                        : 'Estamos generando las dos hojas, una después de la otra: primero la NSFW y luego la vestida se deriva de ella, para que las dos tengan exactamente el mismo cuerpo. Puede tardar un par de minutos.'}{' '}
                    Si sales ahora se pierde el resultado y hay que generarlo de
                    nuevo.
                </Alert>
            )}

            {props.missingSheetNotice && (
                <Alert type="warning" showIcon className="text-xs">
                    {props.missingSheetNotice}
                </Alert>
            )}

            {props.disabledReason && (
                <p className="text-xs text-amber-500">{props.disabledReason}</p>
            )}
        </div>
    )
}

export default BodyLab
