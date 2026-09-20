'use client'

/**
 * ACCESO DE SOPORTE — la pantalla donde el cliente decide y comprueba.
 *
 * Es la contrapartida del panel de plataforma, y sin ella la auditoría sería
 * una promesa nuestra: aquí el dueño de la cuenta ve quién ha entrado, abre la
 * puerta cuando pide ayuda y la cierra cuando quiere. En un producto con
 * contenido privado eso no es cortesía, es el argumento por el que alguien se
 * fía de subir su material.
 *
 * Se dice en voz alta lo que el soporte puede hacer SIN permiso (mirar) en vez
 * de esconderlo: alguien que lo descubre por su cuenta en la bitácora se
 * siente engañado; alguien a quien se lo cuentan de antemano, informado.
 */

import { useState, useTransition } from 'react'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Tag from '@/components/ui/Tag'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import {
    grantSupportAccess,
    revokeSupportAccess,
} from '@/services/SupportAccessService'
import type { SupportAccessState } from '@/services/SupportAccessService'

const fecha = (iso: string) =>
    new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })

/** Qué significa cada apunte de la bitácora, en cristiano. */
const ACCION: Record<string, string> = {
    'impersonation.enter': 'El soporte entró en tu cuenta',
    'impersonation.leave': 'El soporte salió de tu cuenta',
    'grant.tenant': 'Concediste acceso de soporte',
    'grant.break_glass': 'El soporte forzó el acceso',
    'grant.revoke': 'Se retiró el acceso de soporte',
}

const SupportAccessCard = ({ initial }: { initial: SupportAccessState }) => {
    const [state, setState] = useState(initial)
    const [pending, startTransition] = useTransition()

    const refrescarTras = (ok: boolean, error?: string, titulo?: string) => {
        if (!ok) {
            toast.push(
                <Notification type="danger" title={titulo ?? 'No se pudo'}>
                    {error}
                </Notification>,
            )
            return false
        }
        // Recarga la página para releer estado e historial de una sola vez:
        // mantener dos copias del mismo dato en el cliente es cómo se acaba
        // enseñando "puerta cerrada" con la puerta abierta.
        window.location.reload()
        return true
    }

    const conceder = (hours: number) =>
        startTransition(async () => {
            const r = await grantSupportAccess(hours)
            refrescarTras(r.success, r.error, 'No se pudo conceder')
        })

    const revocar = () =>
        startTransition(async () => {
            const r = await revokeSupportAccess()
            refrescarTras(r.success, r.error, 'No se pudo revocar')
        })

    void setState

    return (
        <Card className="mt-4">
            <h5 className="mb-1">Acceso de soporte</h5>
            <p className="text-sm text-gray-500 mb-4">
                El equipo de soporte puede <b>ver</b> tu cuenta para
                diagnosticar problemas, y cada vez que entra queda registrado
                aquí abajo. Para que pueda <b>hacer cambios</b> por ti tienes
                que concederlo, y caduca solo.
            </p>

            {state.active ? (
                <div className="flex flex-wrap items-center gap-3 mb-4">
                    <Tag className="bg-red-100 text-red-700">
                        {state.active.kind === 'break_glass'
                            ? 'Acceso forzado por soporte'
                            : 'Acceso concedido'}
                    </Tag>
                    <span className="text-sm text-gray-500">
                        Caduca el {fecha(state.active.expiresAt)}
                    </span>
                    <Button size="sm" loading={pending} onClick={revocar}>
                        Retirar ahora
                    </Button>
                </div>
            ) : (
                <div className="flex flex-wrap items-center gap-2 mb-4">
                    <span className="text-sm text-gray-500">
                        Permitir que soporte opere mi cuenta durante:
                    </span>
                    {state.options.map((h) => (
                        <Button
                            key={h}
                            size="sm"
                            disabled={pending}
                            onClick={() => conceder(h)}
                        >
                            {h} horas
                        </Button>
                    ))}
                </div>
            )}

            <h6 className="text-sm mb-2">Registro de accesos</h6>
            {state.history.length === 0 ? (
                <p className="text-sm text-gray-400">
                    Nadie de soporte ha entrado en tu cuenta.
                </p>
            ) : (
                <ul className="flex flex-col gap-1">
                    {state.history.map((h) => (
                        <li
                            key={h.id}
                            className="text-sm flex flex-wrap gap-x-2 items-baseline"
                        >
                            <span className="text-gray-400 text-xs">
                                {fecha(h.createdAt)}
                            </span>
                            <span>{ACCION[h.action] ?? h.action}</span>
                            {h.elevated && (
                                <Tag className="bg-amber-100 text-amber-700">
                                    con permiso de escritura
                                </Tag>
                            )}
                            {h.reason && (
                                <span className="text-xs text-gray-500">
                                    — «{h.reason}»
                                </span>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    )
}

export default SupportAccessCard
