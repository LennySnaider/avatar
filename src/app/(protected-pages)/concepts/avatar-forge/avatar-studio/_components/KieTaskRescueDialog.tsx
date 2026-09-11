'use client'

/**
 * "Tengo taskIds de KIE, allí las tareas salieron bien, y aquí no las veo."
 *
 * El botón de reconciliar solo mira el rastro de `pending_generations`: si la
 * tarea nunca llegó a registrarse (todo lo que pasaba por el poll SÍNCRONO de
 * servidor, o lo que el bug de "consulta caída = tarea fallida" borró del
 * rastro), ese botón dice "nada que recuperar" aunque la imagen exista. Este
 * diálogo pregunta a KIE DIRECTAMENTE por los ids, explica qué pasó con cada
 * uno, y baja los resultados que sigan vivos en su CDN.
 *
 * ACEPTA LISTAS porque la API de KIE no sabe enumerar: su histórico solo existe
 * en el panel (kie.ai/logs) y la API solo responde POR ID. Así que auditar "lo
 * de KIE contra lo de la galería" es necesariamente pegar los ids del panel y
 * preguntar por cada uno — esto lo hace por lotes, con avance visible, y
 * rescata en bloque lo que se pueda.
 */
import { useState } from 'react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import {
    apiInspectKieTasks,
    apiRescueKieTasks,
    type KieTaskDiagnosis,
} from '@/services/KieTaskRescueService'

interface KieTaskRescueDialogProps {
    isOpen: boolean
    onClose: () => void
    /** Se llama tras un rescate con éxito para recargar la galería. */
    onRescued: () => void
}

const STATE_LABEL: Record<KieTaskDiagnosis['kieState'], string> = {
    running: 'Generando en KIE',
    success: 'Terminada con éxito en KIE',
    fail: 'Fallida en KIE',
    unknown: 'KIE no reconoce el id',
}

const STATE_TONE: Record<KieTaskDiagnosis['kieState'], string> = {
    running: 'text-amber-600 dark:text-amber-400',
    success: 'text-emerald-600 dark:text-emerald-400',
    fail: 'text-red-600 dark:text-red-400',
    unknown: 'text-gray-500',
}

/**
 * Los ids salen de copiar y pegar del panel de KIE, así que llegan con lo que
 * sea alrededor (comas, saltos, comillas, columnas enteras de una tabla). Se
 * parte por todo lo que no sea carácter de id y se descarta lo corto: los
 * taskId de KIE son hex de 32, y así una palabra suelta pegada por accidente no
 * se convierte en una consulta.
 */
const parseTaskIds = (raw: string): string[] => {
    const seen = new Set<string>()
    for (const tok of raw.split(/[^A-Za-z0-9_-]+/)) {
        if (tok.length >= 16) seen.add(tok)
    }
    return [...seen]
}

/** Tope por llamada del servicio — el troceo vive aquí para poder dar avance. */
const BATCH = 10
/** Techo de sensatez: por encima, mejor en dos tandas. */
const MAX_IDS = 300

const chunk = <T,>(arr: T[], size: number): T[][] => {
    const out: T[][] = []
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
    return out
}

const KieTaskRescueDialog = ({
    isOpen,
    onClose,
    onRescued,
}: KieTaskRescueDialogProps) => {
    const [raw, setRaw] = useState('')
    const [busy, setBusy] = useState<'idle' | 'inspect' | 'rescue'>('idle')
    const [progress, setProgress] = useState({ done: 0, total: 0 })
    const [results, setResults] = useState<KieTaskDiagnosis[]>([])
    /** taskId → mensaje del rescate ya hecho en esta sesión del diálogo. */
    const [rescued, setRescued] = useState<Record<string, string>>({})

    const ids = parseTaskIds(raw)
    const rescuable = results.filter(
        (d) =>
            d.kieState === 'success' && !d.alreadySaved && !rescued[d.taskId],
    )

    const reset = () => {
        setRaw('')
        setResults([])
        setRescued({})
        setProgress({ done: 0, total: 0 })
    }

    const handleInspect = async () => {
        if (!ids.length || busy !== 'idle') return
        if (ids.length > MAX_IDS) {
            toast.push(
                <Notification type="warning" title="Demasiados ids">
                    {`${ids.length} ids de golpe. Pega como mucho ${MAX_IDS} por tanda.`}
                </Notification>,
            )
            return
        }
        setBusy('inspect')
        setResults([])
        setRescued({})
        setProgress({ done: 0, total: ids.length })
        try {
            // Se van pintando conforme llegan: con 100 ids, esperar al final
            // sin señales parece que se colgó.
            for (const batch of chunk(ids, BATCH)) {
                const part = await apiInspectKieTasks(batch)
                setResults((prev) => [...prev, ...part])
                setProgress((p) => ({ ...p, done: p.done + batch.length }))
            }
        } catch (e) {
            toast.push(
                <Notification type="danger" title="No se pudo consultar">
                    {e instanceof Error ? e.message : 'Error desconocido'}
                </Notification>,
            )
        } finally {
            setBusy('idle')
        }
    }

    const handleRescueAll = async () => {
        if (!rescuable.length || busy !== 'idle') return
        setBusy('rescue')
        setProgress({ done: 0, total: rescuable.length })
        let ok = 0
        try {
            for (const batch of chunk(
                rescuable.map((d) => d.taskId),
                BATCH,
            )) {
                const part = await apiRescueKieTasks(batch)
                setRescued((prev) => {
                    const next = { ...prev }
                    for (const r of part) next[r.taskId] = r.message
                    return next
                })
                ok += part.filter((r) => r.success).length
                setProgress((p) => ({ ...p, done: p.done + batch.length }))
            }
            toast.push(
                <Notification
                    type={ok ? 'success' : 'danger'}
                    title={ok ? 'Rescate terminado' : 'No se pudo rescatar'}
                >
                    {`${ok} de ${progress.total || rescuable.length} bajadas a la galería. Las que fallan suelen tener la URL del CDN de KIE ya caducada.`}
                </Notification>,
            )
            if (ok) onRescued()
        } catch (e) {
            toast.push(
                <Notification type="danger" title="Falló el rescate">
                    {e instanceof Error ? e.message : 'Error desconocido'}
                </Notification>,
            )
        } finally {
            setBusy('idle')
        }
    }

    // Recuento para el resumen — el "qué me estás diciendo" de un vistazo.
    const counts = {
        success: results.filter((d) => d.kieState === 'success').length,
        saved: results.filter((d) => d.alreadySaved).length,
        running: results.filter((d) => d.kieState === 'running').length,
        fail: results.filter((d) => d.kieState === 'fail').length,
        unknown: results.filter((d) => d.kieState === 'unknown').length,
    }

    return (
        <Dialog
            isOpen={isOpen}
            width={640}
            onClose={onClose}
            onRequestClose={onClose}
        >
            <h5 className="mb-1">Auditar tareas de KIE por su ID</h5>
            <p className="text-xs text-gray-500 mb-3">
                Pega uno o varios taskId (de{' '}
                <a
                    href="https://kie.ai/logs"
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                >
                    kie.ai/logs
                </a>
                , separados por espacios, comas o saltos de línea). Se consulta
                el estado real de cada uno y se bajan las que terminaron bien
                pero nunca llegaron a la galería. KIE no permite listarlas: por
                eso hay que traer los ids del panel.
            </p>

            <Input
                textArea
                rows={4}
                value={raw}
                placeholder={
                    '87562bce7ac776eeea1684b230554c99\nac7196edf4ca06981b8ec29182df5a11'
                }
                className="font-mono text-xs"
                onChange={(e) => setRaw(e.target.value)}
            />

            <div className="flex items-center gap-2 mt-3">
                <Button
                    variant="solid"
                    loading={busy === 'inspect'}
                    disabled={!ids.length || busy !== 'idle'}
                    onClick={handleInspect}
                >
                    {ids.length > 1
                        ? `Consultar ${ids.length} tareas`
                        : 'Consultar'}
                </Button>
                {results.length > 0 && (
                    <Button
                        variant="solid"
                        loading={busy === 'rescue'}
                        disabled={!rescuable.length || busy !== 'idle'}
                        onClick={handleRescueAll}
                    >
                        {`Rescatar ${rescuable.length} a la galería`}
                    </Button>
                )}
                {busy !== 'idle' && progress.total > 0 && (
                    <span className="text-xs text-gray-500">
                        {progress.done}/{progress.total}
                    </span>
                )}
                {busy === 'idle' && results.length > 0 && (
                    <button
                        type="button"
                        className="text-xs text-gray-500 underline ml-auto"
                        onClick={reset}
                    >
                        Limpiar
                    </button>
                )}
            </div>

            {results.length > 0 && (
                <>
                    <div className="mt-4 text-xs text-gray-600 dark:text-gray-300 flex flex-wrap gap-x-3 gap-y-1">
                        <span>{results.length} consultadas</span>
                        <span className="text-emerald-600 dark:text-emerald-400">
                            {counts.success} terminadas bien
                        </span>
                        <span>{counts.saved} ya en la galería</span>
                        {counts.running > 0 && (
                            <span className="text-amber-600 dark:text-amber-400">
                                {counts.running} aún generando
                            </span>
                        )}
                        {counts.fail > 0 && (
                            <span className="text-red-600 dark:text-red-400">
                                {counts.fail} fallidas en KIE
                            </span>
                        )}
                        {counts.unknown > 0 && (
                            <span>{counts.unknown} sin reconocer</span>
                        )}
                    </div>

                    <div className="mt-2 max-h-80 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-600 divide-y divide-gray-200 dark:divide-gray-600">
                        {results.map((d) => (
                            <div key={d.taskId} className="p-3 text-sm">
                                <div className="flex items-baseline gap-2 flex-wrap">
                                    <span className="font-mono text-xs text-gray-500">
                                        {d.taskId.slice(0, 12)}…
                                    </span>
                                    <span
                                        className={`font-semibold ${STATE_TONE[d.kieState]}`}
                                    >
                                        {STATE_LABEL[d.kieState]}
                                    </span>
                                    {d.model && (
                                        <span className="text-xs text-gray-500">
                                            · {d.model}
                                        </span>
                                    )}
                                    {d.alreadySaved && (
                                        <span className="text-xs text-gray-500">
                                            · ya guardada
                                        </span>
                                    )}
                                    {d.hasOpenHold && (
                                        <span className="text-xs text-amber-600 dark:text-amber-400">
                                            · cobro sin cerrar
                                        </span>
                                    )}
                                </div>
                                {/* Con UN id se enseña el veredicto completo:
                                    es el caso "explícame qué pasó con esta". En
                                    lote sería una pared de texto. */}
                                {(results.length === 1 ||
                                    rescued[d.taskId]) && (
                                    <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                                        {rescued[d.taskId] ?? d.verdict}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                </>
            )}
        </Dialog>
    )
}

export default KieTaskRescueDialog
