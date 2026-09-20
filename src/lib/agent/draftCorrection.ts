/**
 * LA SEÑAL DE CORRECCIÓN — qué guardar cuando un humano arregla al agente.
 *
 * Hasta ahora `approveAndSend` hacía `.update({ text })` con el texto editado
 * ENCIMA del borrador, así que el par más valioso del producto —lo que dijo la
 * IA frente a lo que el humano mandó de verdad— se destruía en cada envío. Y
 * `discardDraft` marcaba `status='discarded'` sin motivo, dejando una señal que
 * nadie podía interpretar después (ni la leía nadie).
 *
 * Este módulo decide QUÉ se guarda. Es puro a propósito, como `attentionClear`
 * o `seats`: el servicio hace el I/O, aquí vive la regla y su test.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DOS REGLAS QUE PARECEN DETALLES Y NO LO SON
 * ─────────────────────────────────────────────────────────────────────────
 *  1. UN "EDITADO" IDÉNTICO NO ES UNA CORRECCIÓN. La UI manda el contenido del
 *     textarea siempre, lo haya tocado el humano o no. Sin comparar, el dataset
 *     se llenaría de pares donde no se cambió nada y el ruido ahogaría la señal.
 *     La comparación va sobre el texto recortado: un espacio de más al final no
 *     es una corrección de estilo.
 *
 *  2. EL ORIGINAL NUNCA SE PISA. Es lo PRIMERO que dijo el modelo. Si el mismo
 *     mensaje pasa por una segunda edición, sobrescribirlo ascendería la
 *     corrección anterior a "original" y el par quedaría falseado justo en el
 *     sentido que más importa: parecería que el modelo escribió algo que
 *     escribió una persona.
 */

/**
 * Por qué se tiró un borrador. Lista cerrada porque esto se agrupa y se cuenta:
 * con texto libre cada quien escribe su variante y no hay forma de ver qué
 * falla más. El matiz va en la nota, que es aparte.
 */
export const DISCARD_REASONS = [
    /** No suena a ella: tono, registro, se sale del personaje. */
    'off_persona',
    /** Dice algo falso sobre la creadora, el contenido o el precio. */
    'wrong_facts',
    /** Vende demasiado pronto o demasiado duro. */
    'too_salesy',
    /** Cruza un límite: temática, consentimiento, algo que no debe decirse. */
    'unsafe',
    /** Idioma equivocado, o escrito de forma que delata que es una máquina. */
    'bad_language',
    /** No encaja en ninguna. La nota explica. */
    'other',
] as const

export type DiscardReason = (typeof DISCARD_REASONS)[number]

/**
 * Estrecha lo que llega del cliente al enum.
 *
 * Compara contra la LISTA y no con `in` sobre un objeto, por lo mismo que
 * `isOrgRole` en `lib/org/permissions.ts`: `in` recorre la cadena de
 * prototipos, así que `'toString'` y `'constructor'` pasarían por motivos
 * válidos. Falla cerrado.
 */
export function isDiscardReason(value: unknown): value is DiscardReason {
    return (
        typeof value === 'string' &&
        (DISCARD_REASONS as readonly string[]).includes(value)
    )
}

export interface ApprovalPatchInput {
    /** `agent_messages.text` tal como está ahora: lo que produjo el modelo. */
    draftText: string | null | undefined
    /** Lo que manda el humano desde el Inbox. `undefined` = no editó. */
    editedText: string | null | undefined
    /** `agent_messages.original_text` ya guardado, si el mensaje ya se corrigió antes. */
    existingOriginal: string | null | undefined
}

export interface ApprovalPatch {
    /** El texto que se envía de verdad. */
    text: string
    /**
     * Qué escribir en `original_text`. `null` significa NO TOCAR la columna —
     * ni había corrección, ni hay original previo que conservar.
     */
    originalText: string | null
    /** ¿Este envío deja un par aprovechable para entrenar? */
    isCorrection: boolean
}

export function buildApprovalPatch({
    draftText,
    editedText,
    existingOriginal,
}: ApprovalPatchInput): ApprovalPatch {
    const draft = (draftText ?? '').trim()
    const edited = editedText === undefined || editedText === null ? null : editedText.trim()

    // No editó: sale el borrador tal cual y no hay nada que aprender.
    if (edited === null) {
        return { text: draft, originalText: null, isCorrection: false }
    }

    // Editó, pero es el mismo texto: tampoco hay nada que aprender.
    if (edited === draft) {
        return { text: draft, originalText: null, isCorrection: false }
    }

    return {
        text: edited,
        // El original es el primero que hubo. Si ya existe, se conserva.
        originalText: existingOriginal ?? draft,
        isCorrection: true,
    }
}
