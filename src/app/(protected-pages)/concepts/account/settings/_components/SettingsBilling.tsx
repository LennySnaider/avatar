'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Alert from '@/components/ui/Alert'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Skeleton from '@/components/ui/Skeleton'
import { getBillingOverview } from '@/services/ModulesService'

/** Lo que sí existe hoy aunque no haya pasarela: saldo real y módulos instalados. */
type BillingOverview = NonNullable<Awaited<ReturnType<typeof getBillingOverview>>['data']>

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
    const [overview, setOverview] = useState<BillingOverview | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let active = true
        getBillingOverview().then((res) => {
            if (!active) return
            if (res.success && res.data) {
                setOverview(res.data)
            } else {
                setError(res.error ?? 'No se pudo cargar el saldo.')
            }
            setLoading(false)
        })
        return () => {
            active = false
        }
    }, [])

    const installedModules = overview?.installed.filter((m) => m.status === 'installed') ?? []

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

            {/* Saldo real y módulos instalados: lo único que SÍ existe hoy, medido
                pero no facturado. No sustituye al Alert de arriba, lo complementa. */}
            <div className="mt-6 flex flex-col gap-3">
                <h5>Saldo y módulos</h5>
                {loading && (
                    <div className="flex flex-col gap-2">
                        <Skeleton height={20} width={160} />
                        <Skeleton height={20} width={240} />
                    </div>
                )}
                {!loading && error && (
                    <Alert showIcon type="danger">
                        {error}
                    </Alert>
                )}
                {!loading && !error && overview && (
                    <Card>
                        <div className="flex flex-col gap-1">
                            <span>Tokens disponibles</span>
                            <h4>{overview.balance.available.toLocaleString()}</h4>
                        </div>
                        <div className="mt-4 flex flex-col gap-1">
                            <span>Módulos instalados</span>
                            {installedModules.length === 0 ? (
                                <span>Ninguno todavía.</span>
                            ) : (
                                <ul className="list-disc list-inside">
                                    {installedModules.map((m) => (
                                        <li key={m.moduleSlug}>{m.moduleSlug}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <div className="mt-4">
                            <Link href="/concepts/account/modules">
                                <Button asElement="div" variant="plain">
                                    Ir a Módulos
                                </Button>
                            </Link>
                        </div>
                    </Card>
                )}
            </div>
        </div>
    )
}

export default SettingsBilling
