'use client'

/**
 * POR QUÉ SE TIRA UN BORRADOR — el diálogo que convierte un descarte en señal.
 *
 * Antes `discardDraft` se llamaba a pelo desde el botón y guardaba
 * `status='discarded'` y nada más. Esa fila sobrevivía en la base y no la leía
 * nadie: "esto estuvo mal" sin decir en qué no sirve para corregir nada.
 *
 * El motivo es de lista CERRADA a propósito (`DISCARD_REASONS`): esto se
 * agrupa y se cuenta, y con texto libre cada quien escribe su variante hasta
 * que no hay forma de ver qué falla más. El matiz va en la nota, que es
 * opcional y aparte.
 *
 * No hay opción "sin motivo": el botón de descartar queda apagado hasta elegir
 * uno. Es la única fricción del flujo y es deliberada — un descarte sin motivo
 * es justo lo que teníamos.
 */

import { useState } from 'react'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Input from '@/components/ui/Input'
import { DISCARD_REASONS, type DiscardReason } from '@/lib/agent/draftCorrection'

/** Cómo se llama cada motivo de cara a quien está en el Inbox. */
const REASON_LABEL: Record<DiscardReason, string> = {
    off_persona: "Doesn't sound like her",
    wrong_facts: 'Says something untrue',
    too_salesy: 'Sells too hard, too soon',
    unsafe: 'Crosses a line',
    bad_language: 'Wrong language or robotic',
    other: 'Something else',
}

interface DiscardReasonDialogProps {
    isOpen: boolean
    busy?: boolean
    onClose: () => void
    onConfirm: (reason: DiscardReason, note?: string) => void
}

const DiscardReasonDialog = ({
    isOpen,
    busy,
    onClose,
    onConfirm,
}: DiscardReasonDialogProps) => {
    const [reason, setReason] = useState<DiscardReason | null>(null)
    const [note, setNote] = useState('')

    // El diálogo se reusa entre borradores: sin limpiar, el motivo del descarte
    // anterior aparecería preseleccionado en el siguiente y se enviaría por
    // inercia, que es exactamente el ruido que este diálogo intenta evitar.
    const close = () => {
        setReason(null)
        setNote('')
        onClose()
    }

    return (
        <Dialog isOpen={isOpen} width={480} onClose={close} onRequestClose={close}>
            <h5 className="mb-1">Discard this draft</h5>
            <p className="text-xs text-gray-400 mb-4">
                What was wrong with it? This is what teaches the agent.
            </p>

            <div className="flex flex-col gap-2 mb-4">
                {DISCARD_REASONS.map((value) => {
                    const selected = reason === value
                    return (
                        <button
                            key={value}
                            type="button"
                            aria-pressed={selected}
                            className={`text-left text-sm rounded-lg border px-3 py-2 transition-colors ${
                                selected
                                    ? 'border-primary bg-primary/10 text-primary font-semibold'
                                    : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                            }`}
                            onClick={() => setReason(value)}
                        >
                            {REASON_LABEL[value]}
                        </button>
                    )
                })}
            </div>

            <Input
                textArea
                rows={2}
                value={note}
                placeholder="Anything worth remembering (optional)"
                onChange={(e) => setNote(e.target.value)}
            />

            <div className="flex justify-end gap-2 mt-4">
                <Button size="sm" disabled={busy} onClick={close}>
                    Cancel
                </Button>
                <Button
                    size="sm"
                    variant="solid"
                    color="red"
                    loading={busy}
                    disabled={!reason}
                    onClick={() => reason && onConfirm(reason, note.trim() || undefined)}
                >
                    Discard
                </Button>
            </div>
        </Dialog>
    )
}

export default DiscardReasonDialog
