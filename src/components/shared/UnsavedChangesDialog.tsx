'use client'

import { HiOutlineExclamation, HiOutlineExclamationCircle } from 'react-icons/hi'
import Avatar from '@/components/ui/Avatar'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'

/**
 * Diálogo de "tienes cambios sin guardar", compartido por los tres editores de
 * avatar (drawer del Studio, drawer de My Avatars y la página de creación).
 *
 * Vive aquí y no en cada host porque son TRES, y tres copias del mismo texto
 * divergen: una se actualiza y las otras dos mienten. Es la misma lección que
 * dejó `handleGenerateBody`, que se triplicó en estos mismos archivos.
 *
 * Se arma sobre el `<Dialog>` de ECME en vez de sobre `ConfirmDialog` porque
 * hacen falta TRES salidas y ese solo trae dos botones fijos. Meter la acción
 * destructiva en el cuerpo del texto la escondería justo donde el usuario no
 * la busca.
 */

interface UnsavedChangesDialogProps {
    isOpen: boolean
    /** Qué se pierde exactamente, en orden de gravedad. */
    lostItems: string[]
    /** Hay una hoja de cuerpo recién generada = dinero ya gastado en KIE. */
    hasFreshBodySheet?: boolean
    /** Generación en curso: no se ofrece ninguna salida. */
    isBusy?: boolean
    canSave: boolean
    /** Por qué no se puede guardar todavía (se muestra bajo el botón). */
    saveBlockedReason?: string
    isSaving?: boolean
    onSaveAndExit: () => void
    onDiscard: () => void
    onKeepEditing: () => void
}

const UnsavedChangesDialog = ({
    isOpen,
    lostItems,
    hasFreshBodySheet = false,
    isBusy = false,
    canSave,
    saveBlockedReason,
    isSaving = false,
    onSaveAndExit,
    onDiscard,
    onKeepEditing,
}: UnsavedChangesDialogProps) => (
    <Dialog
        isOpen={isOpen}
        contentClassName="pb-0 px-0"
        // Las tres rutas de descarte del propio diálogo (X, ESC, backdrop)
        // caen en la opción SEGURA, nunca en descartar.
        onClose={onKeepEditing}
        onRequestClose={onKeepEditing}
    >
        <div className="px-6 pb-6 pt-2 flex">
            <div>
                <Avatar
                    className={
                        hasFreshBodySheet
                            ? 'text-red-600 bg-red-100 dark:text-red-100'
                            : 'text-amber-600 bg-amber-100 dark:text-amber-100'
                    }
                    shape="circle"
                >
                    <span className="text-2xl">
                        {hasFreshBodySheet ? (
                            <HiOutlineExclamation />
                        ) : (
                            <HiOutlineExclamationCircle />
                        )}
                    </span>
                </Avatar>
            </div>
            <div className="ml-4 rtl:mr-4">
                <h5 className="mb-2">
                    {isBusy
                        ? 'Generación en curso'
                        : 'Tienes cambios sin guardar'}
                </h5>
                {isBusy ? (
                    <p className="text-sm">
                        Se está generando el cuerpo del avatar. Si sales ahora
                        se pierde la generación —que KIE ya cobró— y hay que
                        volver a pagarla. Espera a que termine.
                    </p>
                ) : (
                    <>
                        <p className="text-sm">Si sales ahora se pierden:</p>
                        <ul className="mt-1 mb-2 text-sm list-disc list-inside">
                            {lostItems.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                        {hasFreshBodySheet && (
                            <p className="text-sm text-red-500">
                                La hoja de cuerpo recién generada ya se cobró en
                                KIE y no se puede recuperar: hay que generarla
                                otra vez.
                            </p>
                        )}
                        {!canSave && saveBlockedReason && (
                            <p className="mt-2 text-sm text-amber-500">
                                {saveBlockedReason}
                            </p>
                        )}
                    </>
                )}
            </div>
        </div>
        <div className="px-6 py-3 bg-gray-100 dark:bg-gray-700 rounded-bl-2xl rounded-br-2xl">
            <div className="flex items-center gap-2">
                {!isBusy && (
                    <Button
                        size="sm"
                        variant="plain"
                        className="text-red-500 hover:text-red-600"
                        onClick={onDiscard}
                    >
                        Descartar
                    </Button>
                )}
                <div className="flex-1" />
                <Button size="sm" onClick={onKeepEditing}>
                    Seguir editando
                </Button>
                {!isBusy && (
                    <Button
                        size="sm"
                        variant="solid"
                        loading={isSaving}
                        disabled={!canSave}
                        onClick={onSaveAndExit}
                    >
                        Guardar y salir
                    </Button>
                )}
            </div>
        </div>
    </Dialog>
)

/**
 * Toast de confirmación tras descartar. Se exporta desde aquí para que los tres
 * hosts digan exactamente lo mismo — y para que el usuario tenga constancia de
 * qué acaba de perder, sobre todo cuando había una hoja pagada de por medio.
 */
export const notifyDiscarded = (
    lostItems: string[],
    hadFreshBodySheet = false,
) => {
    toast.push(
        <Notification type="warning" title="Cambios descartados">
            {hadFreshBodySheet
                ? `Se descartó la hoja de cuerpo generada y ${lostItems.length - 1} cambio(s) más. Habrá que volver a generarla.`
                : `Se descartaron ${lostItems.length} cambio(s) sin guardar.`}
        </Notification>,
    )
}

export default UnsavedChangesDialog
