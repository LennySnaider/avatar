'use client'

/**
 * Marcas permanentes del avatar: mapa corporal para asignar tatuajes,
 * cicatrices y lunares a una zona concreta.
 *
 * DOS DECISIONES DE UI QUE NO SON ADORNO:
 *
 *  1. Cada mitad del dibujo va ROTULADA ("Su derecha" / "Su izquierda"), y se
 *     invierten al pasar a la vista de espalda. La mitad izquierda del dibujo
 *     es el lado DERECHO de ella, y ese despiste se cuela siempre. El lado es
 *     además el dato que los modelos más se inventan, así que se elige a mano
 *     y nunca se deduce de la foto.
 *  2. La visibilidad se enseña por ROPA (siempre / ropa ligera / bañador), no
 *     como NSFW. La ingle se ve en bikini y un bikini no es contenido adulto.
 *
 * El selector de zona lista TODAS las zonas del catálogo; el mapa solo dibuja
 * las que tienen geometría. Una zona sin dibujo sigue siendo elegible.
 */
import { useCallback, useEffect, useState } from 'react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import Spinner from '@/components/ui/Spinner'
import { HiOutlineTrash } from 'react-icons/hi'
import {
    MARK_ZONES,
    exposureLabel,
    findZone,
    markPhrase,
    zoneLabel,
    type MarkSide,
} from '@/lib/avatar/marks'
import {
    createAvatarMark,
    deleteAvatarMark,
    listAvatarMarks,
    updateAvatarMark,
    type AvatarMarkRow,
} from '@/services/AvatarMarksService'

interface Shape {
    view: 'front' | 'back'
    kind: 'rect' | 'oval'
    /** rect: x,y,w,h,r · oval: cx,cy,rx,ry */
    coords: number[]
}

/** Geometría del muñeco (viewBox 220×380). Solo las zonas dibujables. */
const ZONE_SHAPES: Record<string, Shape> = {
    cuello_lateral: { view: 'front', kind: 'oval', coords: [101, 70, 7, 7] },
    hombro: { view: 'front', kind: 'oval', coords: [68, 84, 12, 10] },
    brazo_exterior: { view: 'front', kind: 'rect', coords: [52, 92, 18, 48, 9] },
    antebrazo_interior: { view: 'front', kind: 'rect', coords: [46, 142, 17, 60, 8] },
    dorso_mano: { view: 'front', kind: 'oval', coords: [54, 214, 11, 14] },
    esternon: { view: 'front', kind: 'rect', coords: [100, 88, 20, 22, 6] },
    costillas: { view: 'front', kind: 'rect', coords: [80, 112, 22, 30, 6] },
    abdomen: { view: 'front', kind: 'rect', coords: [98, 150, 24, 28, 6] },
    cadera: { view: 'front', kind: 'rect', coords: [80, 176, 22, 20, 6] },
    ingle: { view: 'front', kind: 'oval', coords: [97, 198, 11, 9] },
    muslo_frontal: { view: 'front', kind: 'rect', coords: [82, 212, 26, 60, 12] },
    pantorrilla: { view: 'front', kind: 'rect', coords: [84, 282, 22, 56, 10] },
    nuca: { view: 'back', kind: 'rect', coords: [102, 62, 16, 12, 4] },
    omoplato: { view: 'back', kind: 'oval', coords: [92, 94, 13, 11] },
    espalda_alta: { view: 'back', kind: 'rect', coords: [100, 78, 20, 18, 5] },
    columna: { view: 'back', kind: 'rect', coords: [104, 106, 12, 48, 5] },
    lumbar: { view: 'back', kind: 'rect', coords: [94, 158, 32, 20, 6] },
    gluteo: { view: 'back', kind: 'oval', coords: [96, 194, 15, 13] },
}

/** El muñeco: shapes de fondo, iguales en las dos vistas. */
const BODY_RECTS = [
    [104, 62, 12, 14, 5],
    [74, 76, 72, 70, 18],
    [78, 140, 64, 62, 18],
    [52, 82, 18, 62, 9],
    [46, 140, 17, 64, 8],
    [150, 82, 18, 62, 9],
    [157, 140, 17, 64, 8],
    [82, 196, 26, 82, 13],
    [112, 196, 26, 82, 13],
    [84, 272, 22, 72, 11],
    [114, 272, 22, 72, 11],
]
const BODY_OVALS = [
    [110, 40, 20, 25],
    [54, 214, 11, 14],
    [166, 214, 11, 14],
    [95, 352, 11, 9],
    [125, 352, 11, 9],
]

interface FormState {
    id: string | null
    zone: string
    side: MarkSide | null
    content: string
    inkStyle: string
    coverage: string
    orientation: string
}

const EMPTY: FormState = {
    id: null,
    zone: 'antebrazo_interior',
    side: 'right',
    content: '',
    inkStyle: '',
    coverage: '',
    orientation: '',
}

const rowToForm = (row: AvatarMarkRow): FormState => ({
    id: row.id,
    zone: row.zone,
    side: row.side,
    content: row.content,
    inkStyle: row.ink_style ?? '',
    coverage: row.coverage ?? '',
    orientation: row.orientation ?? '',
})

interface AvatarMarksDialogProps {
    isOpen: boolean
    onClose: () => void
    avatarId: string
    avatarName?: string
    /**
     * Marcas tras cada cambio. El diálogo NO escribe en el store del estudio a
     * propósito: se abre también desde la lista de avatares, y ahí el avatar
     * editado no es el que el estudio tiene cargado — sus marcas acabarían en
     * el prompt de OTRA. Quien sí es el avatar activo (el panel del estudio)
     * pasa este callback y las vuelca él.
     */
    onChange?: (marks: AvatarMarkRow[]) => void
}

const AvatarMarksDialog = ({
    isOpen,
    onClose,
    avatarId,
    avatarName,
    onChange,
}: AvatarMarksDialogProps) => {
    const [rows, setRows] = useState<AvatarMarkRow[]>([])
    const [form, setForm] = useState<FormState>(EMPTY)
    const [view, setView] = useState<'front' | 'back'>('front')
    const [isLoading, setIsLoading] = useState(false)
    const [isSaving, setIsSaving] = useState(false)

    const publish = useCallback(
        (next: AvatarMarkRow[]) => {
            setRows(next)
            onChange?.(next)
        },
        [onChange],
    )

    useEffect(() => {
        if (!isOpen || !avatarId) return
        let cancelled = false
        setIsLoading(true)
        listAvatarMarks(avatarId)
            .then((data) => {
                if (cancelled) return
                publish(data)
            })
            .catch((err) => {
                if (cancelled) return
                toast.push(
                    <Notification type="danger" title="Marcas">
                        {err instanceof Error ? err.message : 'No se pudieron cargar'}
                    </Notification>,
                )
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [isOpen, avatarId, publish])

    const zone = findZone(form.zone)
    const marked = new Set(rows.map((r) => r.zone))

    const selectZone = (zoneId: string) => {
        const existing = rows.find((r) => r.zone === zoneId)
        if (existing) {
            setForm(rowToForm(existing))
            return
        }
        const def = findZone(zoneId)
        setForm({
            ...EMPTY,
            zone: zoneId,
            side: def?.lateral ? 'right' : null,
        })
    }

    const handleSave = async () => {
        if (!form.content.trim()) {
            toast.push(
                <Notification type="warning" title="Falta la descripción">
                    Describe qué es la marca: es lo único que reciben los motores de
                    solo texto.
                </Notification>,
            )
            return
        }
        setIsSaving(true)
        try {
            const payload = {
                avatarId,
                zone: form.zone,
                side: zone?.lateral ? form.side : null,
                content: form.content,
                inkStyle: form.inkStyle,
                coverage: form.coverage,
                orientation: form.orientation,
            }
            const saved = form.id
                ? await updateAvatarMark(form.id, payload)
                : await createAvatarMark(payload)
            publish(
                form.id
                    ? rows.map((r) => (r.id === saved.id ? saved : r))
                    : [...rows, saved],
            )
            setForm(rowToForm(saved))
            toast.push(
                <Notification type="success" title="Marca guardada">
                    {zoneLabel(saved)} — viaja ya en todas las generaciones.
                </Notification>,
            )
        } catch (err) {
            toast.push(
                <Notification type="danger" title="No se pudo guardar">
                    {err instanceof Error ? err.message : 'Error desconocido'}
                </Notification>,
            )
        } finally {
            setIsSaving(false)
        }
    }

    const handleDelete = async (id: string) => {
        try {
            await deleteAvatarMark(id)
            publish(rows.filter((r) => r.id !== id))
            if (form.id === id) setForm(EMPTY)
        } catch (err) {
            toast.push(
                <Notification type="danger" title="No se pudo borrar">
                    {err instanceof Error ? err.message : 'Error desconocido'}
                </Notification>,
            )
        }
    }

    const shapeFor = (zoneId: string) => ZONE_SHAPES[zoneId]
    const visibleZones = MARK_ZONES.filter((z) => shapeFor(z.id)?.view === view)

    const fillFor = (zoneId: string) =>
        marked.has(zoneId) ? '#db2777' : 'rgba(148,163,184,.16)'
    const strokeFor = (zoneId: string) =>
        zoneId === form.zone ? '#2563eb' : marked.has(zoneId) ? '#db2777' : '#94a3b8'

    return (
        <Dialog
            isOpen={isOpen}
            onClose={onClose}
            width={900}
            className="bg-white! dark:bg-gray-900!"
        >
            <h5 className="mb-1">Marcas permanentes{avatarName ? ` · ${avatarName}` : ''}</h5>
            <p className="text-sm text-gray-500 mb-4">
                Tatuajes, cicatrices y lunares que forman parte de su cuerpo en toda
                generación. No hay que escribirlos en el prompt.
            </p>

            {/* Mismo motivo que en PostModal: `svh` en vez de `vh` para que el
                botón del pie no se salga de la pantalla en el móvil. */}
            <div className="flex flex-col lg:flex-row gap-5 max-h-[calc(100svh-14rem)] sm:max-h-[70vh] overflow-y-auto pr-1">
                {/* Mapa corporal */}
                <div className="lg:w-[320px] shrink-0">
                    <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg mb-2">
                        {(['front', 'back'] as const).map((v) => (
                            <button
                                key={v}
                                type="button"
                                onClick={() => setView(v)}
                                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                                    view === v
                                        ? 'bg-white dark:bg-gray-700 shadow-sm'
                                        : 'text-gray-500'
                                }`}
                            >
                                {v === 'front' ? 'Frente' : 'Espalda'}
                            </button>
                        ))}
                    </div>

                    <div className="flex justify-between px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                        <span>{view === 'front' ? 'Su derecha' : 'Su izquierda'}</span>
                        <span>{view === 'front' ? 'Su izquierda' : 'Su derecha'}</span>
                    </div>

                    <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-2 flex justify-center">
                        <svg
                            viewBox="0 0 220 380"
                            className="w-[240px] h-auto"
                            role="img"
                            aria-label="Mapa del cuerpo: elige una zona"
                        >
                            {BODY_RECTS.map(([x, y, w, h, r], i) => (
                                <rect
                                    key={`br-${i}`}
                                    x={x}
                                    y={y}
                                    width={w}
                                    height={h}
                                    rx={r}
                                    fill="#e6ebf2"
                                    stroke="#cbd5e1"
                                />
                            ))}
                            {BODY_OVALS.map(([cx, cy, rx, ry], i) => (
                                <ellipse
                                    key={`bo-${i}`}
                                    cx={cx}
                                    cy={cy}
                                    rx={rx}
                                    ry={ry}
                                    fill="#e6ebf2"
                                    stroke="#cbd5e1"
                                />
                            ))}
                            <line
                                x1="110"
                                y1="20"
                                x2="110"
                                y2="360"
                                stroke="#cbd5e1"
                                strokeDasharray="3 5"
                            />
                            {visibleZones.map((z) => {
                                const shape = shapeFor(z.id)
                                const common = {
                                    fill: fillFor(z.id),
                                    stroke: strokeFor(z.id),
                                    strokeWidth: z.id === form.zone ? 2.5 : 1,
                                    className: 'cursor-pointer',
                                    onClick: () => selectZone(z.id),
                                }
                                if (shape.kind === 'rect') {
                                    const [x, y, w, h, r] = shape.coords
                                    return (
                                        <rect
                                            key={z.id}
                                            x={x}
                                            y={y}
                                            width={w}
                                            height={h}
                                            rx={r}
                                            {...common}
                                        >
                                            <title>{z.label}</title>
                                        </rect>
                                    )
                                }
                                const [cx, cy, rx, ry] = shape.coords
                                return (
                                    <ellipse key={z.id} cx={cx} cy={cy} rx={rx} ry={ry} {...common}>
                                        <title>{z.label}</title>
                                    </ellipse>
                                )
                            })}
                        </svg>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">
                        El mapa dibuja las zonas más usadas. El resto se eligen en la
                        lista de al lado.
                    </p>
                </div>

                {/* Ficha de la zona */}
                <div className="flex-1 min-w-0 flex flex-col gap-4">
                    <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                        <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="min-w-0">
                                <label
                                    htmlFor="mark-zone"
                                    className="block text-xs font-medium text-gray-500 mb-1"
                                >
                                    Zona
                                </label>
                                <select
                                    id="mark-zone"
                                    value={form.zone}
                                    onChange={(e) => selectZone(e.target.value)}
                                    className="text-sm px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                                >
                                    {MARK_ZONES.map((z) => (
                                        <option key={z.id} value={z.id}>
                                            {z.label}
                                            {marked.has(z.id) ? ' ·' : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            {zone && (
                                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 dark:bg-teal-900/40 dark:text-teal-200 shrink-0">
                                    {exposureLabel(zone.exposure)}
                                </span>
                            )}
                        </div>

                        {zone?.lateral && (
                            <div className="mb-3">
                                <span className="block text-xs font-medium text-gray-500 mb-1">
                                    Lado
                                </span>
                                <div className="flex gap-2">
                                    {(['right', 'left'] as const).map((s) => (
                                        <button
                                            key={s}
                                            type="button"
                                            onClick={() => setForm({ ...form, side: s })}
                                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                                                form.side === s
                                                    ? 'border-primary bg-primary text-white'
                                                    : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                                            }`}
                                        >
                                            {s === 'right' ? 'Derecho' : 'Izquierdo'}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-[11px] text-gray-400 mt-1">
                                    No se deduce de la foto: es el dato que más se
                                    equivocan los modelos.
                                </p>
                            </div>
                        )}

                        <div className="space-y-3">
                            <div>
                                <label
                                    htmlFor="mark-content"
                                    className="block text-xs font-medium text-gray-500 mb-1"
                                >
                                    Qué es
                                </label>
                                <input
                                    id="mark-content"
                                    type="text"
                                    value={form.content}
                                    onChange={(e) => setForm({ ...form, content: e.target.value })}
                                    placeholder="Peonía con hojas y capullo de rosa"
                                    className="w-full text-sm px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                                />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label
                                        htmlFor="mark-ink"
                                        className="block text-xs font-medium text-gray-500 mb-1"
                                    >
                                        Estilo de tinta
                                    </label>
                                    <input
                                        id="mark-ink"
                                        type="text"
                                        value={form.inkStyle}
                                        onChange={(e) =>
                                            setForm({ ...form, inkStyle: e.target.value })
                                        }
                                        placeholder="Negro y gris, línea fina"
                                        className="w-full text-sm px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                                    />
                                </div>
                                <div>
                                    <label
                                        htmlFor="mark-coverage"
                                        className="block text-xs font-medium text-gray-500 mb-1"
                                    >
                                        Cuánto ocupa
                                    </label>
                                    <input
                                        id="mark-coverage"
                                        type="text"
                                        value={form.coverage}
                                        onChange={(e) =>
                                            setForm({ ...form, coverage: e.target.value })
                                        }
                                        placeholder="Dos tercios del antebrazo"
                                        className="w-full text-sm px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                                    />
                                </div>
                            </div>
                            <div>
                                <label
                                    htmlFor="mark-orientation"
                                    className="block text-xs font-medium text-gray-500 mb-1"
                                >
                                    Orientación
                                </label>
                                <input
                                    id="mark-orientation"
                                    type="text"
                                    value={form.orientation}
                                    onChange={(e) =>
                                        setForm({ ...form, orientation: e.target.value })
                                    }
                                    placeholder="De la muñeca al codo"
                                    className="w-full text-sm px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                                />
                            </div>
                        </div>

                        <div className="mt-3 p-2.5 bg-gray-50 dark:bg-gray-800 rounded-lg">
                            <p className="text-[11px] text-gray-500 font-mono break-words">
                                {markPhrase(form) || '—'}
                            </p>
                        </div>

                        <div className="flex justify-end gap-2 mt-4">
                            {form.id && (
                                <Button
                                    size="sm"
                                    variant="plain"
                                    icon={<HiOutlineTrash />}
                                    onClick={() => handleDelete(form.id as string)}
                                >
                                    Borrar
                                </Button>
                            )}
                            <Button
                                size="sm"
                                variant="solid"
                                loading={isSaving}
                                onClick={handleSave}
                            >
                                {form.id ? 'Guardar cambios' : 'Añadir marca'}
                            </Button>
                        </div>
                    </div>

                    <div>
                        <h6 className="text-sm font-semibold mb-2">
                            En su cuerpo{isLoading ? '' : ` (${rows.length})`}
                        </h6>
                        {isLoading ? (
                            <div className="flex justify-center py-4">
                                <Spinner size={24} />
                            </div>
                        ) : rows.length === 0 ? (
                            <p className="text-xs text-gray-400 py-3">
                                Todavía ninguna. Elige una zona y descríbela.
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {rows.map((row) => (
                                    <button
                                        key={row.id}
                                        type="button"
                                        onClick={() => {
                                            setForm(rowToForm(row))
                                            const shape = ZONE_SHAPES[row.zone]
                                            if (shape) setView(shape.view)
                                        }}
                                        className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-colors ${
                                            form.id === row.id
                                                ? 'border-primary/40 bg-primary/5'
                                                : 'border-gray-200 dark:border-gray-700'
                                        }`}
                                    >
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-sm font-medium truncate">
                                                {zoneLabel(row)}
                                            </span>
                                            <span className="block text-xs text-gray-500 truncate">
                                                {row.content}
                                            </span>
                                        </span>
                                        {!row.baked_at && (
                                            <span className="text-[10px] text-gray-400 shrink-0">
                                                solo texto
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex justify-end mt-4">
                <Button variant="solid" onClick={onClose}>
                    Listo
                </Button>
            </div>
        </Dialog>
    )
}

export default AvatarMarksDialog
