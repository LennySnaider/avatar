'use client'

import Alert from '@/components/ui/Alert'

/**
 * Esta pestaña era una maqueta de ECME de arriba abajo, y mentia en tres capas
 * a la vez:
 *
 *  1) Afirmaba una suscripcion: pintaba plan, estado "active", ciclo de
 *     facturacion y "Next payment on <fecha> for $<importe>" leyendo
 *     /api/setting/billing, que devolvia `billingSettingsData` de src/mock. Es
 *     decir, la app le decia al usuario que le ibamos a cobrar una cantidad
 *     concreta en una fecha concreta sin que existiera ni suscripcion ni cargo.
 *  2) Afirmaba metodos de pago guardados: tarjetas VISA/MASTER de mentira, con
 *     su "Primary" y su caducidad, y un dialogo de añadir/editar cuyo submit era
 *     `console.log(values)` + `sleep(500)` + toast "Credit card added!". Al
 *     recargar la tarjeta desaparecia, porque nunca salio del navegador.
 *  3) Afirmaba un historial de transacciones: facturas inventadas con importes y
 *     estados, en un componente BillingHistory que solo vivia aqui.
 *
 * Y el boton "Change plan" llevaba a /concepts/account/pricing con
 * ?subcription=basic&cycle=monthly, que era justo lo que hacia que la pagina de
 * precios dijera "Current plan". Se retira: era el unico camino desde el menu de
 * usuario real hasta el checkout falso.
 *
 * NO se implementa aqui a proposito — cobrar exige pasarela y el proyecto va en
 * measure-only (F5.5 del ledger, ENFORCE_LIMITS apagado). Lo que haria falta
 * para que esta pantalla vuelva a tener contenido:
 *   - proveedor de pagos + webhook de confirmacion (ver PaymentDialog.tsx, que
 *     lleva la lista completa),
 *   - tabla de suscripciones por organizacion, con plan, estado y proximo cargo
 *     REALES, y su enganche con el ledger de tokens que ya existe,
 *   - metodos de pago referenciados por token del proveedor: aqui nunca debe
 *     guardarse un PAN,
 *   - historial leido de las facturas del proveedor, no de una tabla propia.
 * Se borraron BillingHistory.tsx, /api/setting/billing y apiGetSettingsBilling
 * en el mismo cambio: eran los conductos de los datos falsos. La tabla se vuelve
 * a escribir cuando haya facturas de verdad que enseñar.
 */
const SettingsBilling = () => {
    return (
        <div>
            <h4 className="mb-4">Billing</h4>
            <Alert showIcon type="warning">
                Billing is not available yet
            </Alert>
            <div className="mt-4 flex flex-col gap-4 leading-relaxed">
                <p>
                    There is no subscription, no payment method and no invoice
                    attached to this account, and this app cannot take payments:
                    no payment provider is connected.
                </p>
                <p>
                    Usage is currently metered but not billed, so nothing here
                    will charge you. Any plan or amount you may have seen on
                    this screen before was placeholder data from the template.
                </p>
            </div>
        </div>
    )
}

export default SettingsBilling
