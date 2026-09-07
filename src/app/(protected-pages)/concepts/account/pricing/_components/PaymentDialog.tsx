'use client'

import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Alert from '@/components/ui/Alert'
import sleep from '@/utils/sleep'
import { usePricingStore } from '../_store/pricingStore'

/**
 * Este dialogo era el embuste mas grave que quedaba de la plantilla ECME:
 * `handlePay` hacia `sleep(500)` y pintaba "Thank you for your purchase!" con
 * un tick verde y un boton "Manage subscription". No habia pasarela, ni intento
 * de cobro, ni cambio de plan, ni email de confirmacion — y los campos de
 * tarjeta (numero, caducidad, CVC) ni siquiera estaban conectados a un
 * formulario: se tecleaban, se leian con react-number-format y se tiraban al
 * cerrar. Lo que se rompia por ello: un usuario podia salir de aqui convencido
 * de que le habiamos cobrado, revisar su banco al mes siguiente y reclamar un
 * cargo que nunca existio (o peor, dar por hecho que ya tenia el plan Pro).
 *
 * Aqui NO se implementa el cobro a proposito: el proyecto va en measure-only
 * (F5.5 del ledger de tokens, ENFORCE_LIMITS apagado) y cobrar exige decisiones
 * que no son de quien pasa por este fichero. Para hacerlo real harian falta,
 * como minimo:
 *   - un proveedor de pagos con sus claves por entorno,
 *   - checkout alojado o PaymentIntent creado en SERVIDOR: la tarjeta no puede
 *     pasar por este componente si no queremos entrar en alcance PCI completo,
 *   - webhook de confirmacion, porque un cobro esta hecho cuando lo dice el
 *     proveedor, no cuando el navegador vuelve de la pasarela,
 *   - una tabla de suscripciones por organizacion, enganchada al ledger,
 *   - y unos planes de verdad: los de esta pantalla salen de datos mock de la
 *     plantilla, incluido el "$399 every month" que estaba escrito a mano.
 * Mientras nada de eso exista, el dialogo dice la verdad y no acepta ni un dato.
 */
const PaymentDialog = () => {
    const { paymentDialog, setPaymentDialog, selectedPlan, setSelectedPlan } =
        usePricingStore()

    const handleDialogClose = async () => {
        setPaymentDialog(false)
        // El retardo es solo cosmetico: deja terminar la animacion de cierre
        // antes de vaciar el plan, para que el titulo no parpadee.
        await sleep(200)
        setSelectedPlan({})
    }

    return (
        <Dialog
            isOpen={paymentDialog}
            onClose={handleDialogClose}
            onRequestClose={handleDialogClose}
        >
            <h4>{selectedPlan.planName} plan</h4>
            <Alert showIcon type="warning" className="mt-6">
                Checkout is not available yet
            </Alert>
            <div className="mt-4 flex flex-col gap-4 leading-relaxed">
                <p>
                    This app cannot take payments. No payment provider is
                    connected, so there is nothing to charge your card with and
                    no subscription to change.
                </p>
                <p>
                    Nothing has been charged and no card details are requested,
                    stored or sent anywhere. The plans and prices shown on this
                    page are placeholder data from the template.
                </p>
            </div>
            <div className="mt-6">
                <Button block variant="solid" onClick={handleDialogClose}>
                    Close
                </Button>
            </div>
        </Dialog>
    )
}

export default PaymentDialog
