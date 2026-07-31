'use client'

/**
 * "Tengo el taskId de KIE, la tarea salió bien allí, y aquí no la veo."
 *
 * El botón de reconciliar solo mira el rastro de `pending_generations`: si la
 * tarea nunca llegó a registrarse (todo lo que pasaba por el poll SÍNCRONO de
 * servidor), ese botón dice "nada que recuperar" aunque la imagen exista. Este
 * diálogo pregunta a KIE DIRECTAMENTE por el id, explica qué pasó, y baja el
 * resultado si todavía está vivo en su CDN.
 */
import { useState } from 'react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import {
    apiInspectKieTask,
    apiRescueKieTask,
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

const KieTaskRescueDialog = ({
    isOpen,
    onClose,
    onRescued,
}: KieTaskRescueDialogProps) => {
    const [taskId, setTaskId] = useState('')
    const [busy, setBusy] = useState(false)
    const [diagnosis, setDiagnosis] = useState<KieTaskDiagnosis | null>(null)

    const reset = () => {
        setTaskId('')
        setDiagnosis(null)
    }

    const handleInspect = async () => {
        if (!taskId.trim() || busy) return
        setBusy(true)
        setDiagnosis(null)
        try {
            setDiagnosis(await apiInspectKieTask(taskId))
        } catch (e) {
            toast.push(
                <Notification type="danger" title="No se pudo consultar">
                    {e instanceof Error ? e.message : 'Error desconocido'}
                </Notification>,
            )
        } finally {
            setBusy(false)
        }
    }

    const handleRescue = async () => {
        if (!diagnosis || busy) return
        setBusy(true)
        try {
            const r = await apiRescueKieTask({ taskId: diagnosis.taskId })
            toast.push(
                <Notification
                    type={r.success ? 'success' : 'danger'}
                    title={r.success ? 'Rescatada' : 'No se pudo rescatar'}
                >
                    {r.message}
                </Notification>,
            )
            if (r.success) {
                onRescued()
                reset()
                onClose()
            }
        } finally {
            setBusy(false)
        }
    }

    return (
        <Dialog
            isOpen={isOpen}
            width={560}
            onClose={onClose}
            onRequestClose={onClose}
        >
            <h5 className="mb-1">Buscar una tarea de KIE por su ID</h5>
            <p className="text-xs text-gray-500 mb-4">
                Pega el taskId que ves en el panel de KIE. Se consulta su estado
                real y, si terminó bien pero no llegó a la galería, se baja
                desde aquí.
            </p>

            <div className="flex gap-2">
                <Input
                    value={taskId}
                    placeholder="p. ej. 87562bce7ac776eeea1684b230554c99"
                    className="flex-1 font-mono text-sm"
                    onChange={(e) => setTaskId(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleInspect()
                    }}
                />
                <Button
                    variant="solid"
                    loading={busy && !diagnosis}
                    disabled={!taskId.trim()}
                    onClick={handleInspect}
                >
                    Consultar
                </Button>
            </div>

            {diagnosis && (
                <div className="mt-4 rounded-lg border border-gray-200 dark:border-gray-600 p-3 text-sm space-y-2">
                    <div
                        className={`font-semibold ${STATE_TONE[diagnosis.kieState]}`}
                    >
                        {STATE_LABEL[diagnosis.kieState]}
                        {diagnosis.model ? ` · ${diagnosis.model}` : ''}
                        {diagnosis.family ? ` · ${diagnosis.family}` : ''}
                    </div>
                    <p className="text-gray-600 dark:text-gray-300">
                        {diagnosis.verdict}
                    </p>
                    <ul className="text-xs text-gray-500 space-y-0.5">
                        <li>
                            Rastro de reclamables:{' '}
                            {diagnosis.tracked ? 'sí' : 'no'}
                        </li>
                        <li>
                            Ya guardada en galería:{' '}
                            {diagnosis.alreadySaved ? 'sí' : 'no'}
                        </li>
                        <li>
                            Cobro pendiente de cerrar:{' '}
                            {diagnosis.hasOpenHold ? 'sí' : 'no'}
                        </li>
                    </ul>
                    {diagnosis.kieState === 'success' &&
                        !diagnosis.alreadySaved && (
                            <Button
                                block
                                variant="solid"
                                loading={busy}
                                onClick={handleRescue}
                            >
                                Rescatar a la galería
                            </Button>
                        )}
                </div>
            )}
        </Dialog>
    )
}

export default KieTaskRescueDialog
