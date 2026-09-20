'use client'

/**
 * La lista de organizaciones del panel de plataforma.
 *
 * Dos acciones por fila, y la diferencia entre ellas es el corazón del modelo:
 *  - «Ver como» entra siempre. Sin concesión viva se entra en modo LECTURA, y
 *    eso queda auditado. Leer es libre porque un muro bloquearía el soporte y
 *    la moderación sin proteger a nadie de verdad.
 *  - «Romper el cristal» eleva a escritura SIN que el tenant lo conceda, y por
 *    eso pide motivo escrito, dura una hora y se pinta aparte. Existe para el
 *    caso que el usuario señaló y que ningún modelo de consentimiento puro
 *    cubre: el tenant que no puede entrar para abrirte la puerta.
 */

import { useState, useTransition } from 'react'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Dialog from '@/components/ui/Dialog'
import Input from '@/components/ui/Input'
import Tag from '@/components/ui/Tag'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { breakGlass, enterOrg } from '@/services/PlatformService'
import type { OrgOverview } from '@/lib/platform/platformDb'

interface PlatformOrgsClientProps {
    orgs: OrgOverview[]
    withLiveGrant: string[]
}

const PlatformOrgsClient = ({ orgs, withLiveGrant }: PlatformOrgsClientProps) => {
    const [pending, startTransition] = useTransition()
    const [glassFor, setGlassFor] = useState<OrgOverview | null>(null)
    const [motivo, setMotivo] = useState('')
    const abiertas = new Set(withLiveGrant)

    const entrar = (org: OrgOverview) => {
        startTransition(async () => {
            const r = await enterOrg(org.id)
            if (!r.success) {
                toast.push(
                    <Notification type="danger" title="No se pudo entrar">
                        {r.error}
                    </Notification>,
                )
                return
            }
            // Recarga dura: la cookie cambia la organización de todo el árbol
            // de servidor, así que no basta con un refresh suave.
            window.location.href = '/'
        })
    }

    const romper = () => {
        if (!glassFor) return
        startTransition(async () => {
            const r = await breakGlass(glassFor.id, motivo)
            if (!r.success) {
                toast.push(
                    <Notification type="danger" title="No se pudo">
                        {r.error}
                    </Notification>,
                )
                return
            }
            const org = glassFor
            setGlassFor(null)
            setMotivo('')
            entrar(org)
        })
    }

    return (
        <Card>
            <div className="mb-4">
                <h4>Organizaciones</h4>
                <p className="text-sm text-gray-500">
                    Entrar a mirar es libre y queda registrado. Para operar hace
                    falta que el tenant lo conceda.
                </p>
            </div>

            {/* Contenedor propio con scroll: la tabla es lo único que puede
                ser más ancho que la pantalla en móvil. */}
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-gray-500 border-b border-gray-200 dark:border-gray-600">
                            <th className="py-2 pr-4 font-semibold">Organización</th>
                            <th className="py-2 pr-4 font-semibold">Plan</th>
                            <th className="py-2 pr-4 font-semibold">Miembros</th>
                            <th className="py-2 pr-4 font-semibold">Soporte</th>
                            <th className="py-2 font-semibold text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {orgs.map((o) => (
                            <tr
                                key={o.id}
                                className="border-b border-gray-100 dark:border-gray-700"
                            >
                                <td className="py-3 pr-4">
                                    <div className="font-semibold">{o.name}</div>
                                    <div className="text-xs text-gray-400">
                                        {o.slug ?? o.id}
                                    </div>
                                </td>
                                <td className="py-3 pr-4">
                                    {o.planSlug ?? '—'}
                                    {o.billingExempt && (
                                        <Tag className="ml-2 bg-emerald-100 text-emerald-700">
                                            exenta
                                        </Tag>
                                    )}
                                </td>
                                <td className="py-3 pr-4">{o.memberCount}</td>
                                <td className="py-3 pr-4">
                                    {abiertas.has(o.id) ? (
                                        <Tag className="bg-red-100 text-red-700">
                                            puerta abierta
                                        </Tag>
                                    ) : (
                                        <span className="text-gray-400">cerrada</span>
                                    )}
                                </td>
                                <td className="py-3 text-right whitespace-nowrap">
                                    <Button
                                        size="xs"
                                        disabled={pending}
                                        onClick={() => entrar(o)}
                                    >
                                        Ver como
                                    </Button>
                                    {!abiertas.has(o.id) && (
                                        <Button
                                            size="xs"
                                            className="ml-2"
                                            disabled={pending}
                                            onClick={() => setGlassFor(o)}
                                        >
                                            Romper el cristal
                                        </Button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <Dialog
                isOpen={glassFor !== null}
                width={520}
                onClose={() => setGlassFor(null)}
                onRequestClose={() => setGlassFor(null)}
            >
                <h5 className="mb-1">Romper el cristal</h5>
                <p className="text-sm text-gray-500 mb-4">
                    Vas a poder escribir en <b>{glassFor?.name}</b> sin que su
                    propietario te lo haya concedido. Dura una hora, se le avisa
                    y queda en la bitácora con tu nombre y este motivo.
                </p>
                <Input
                    textArea
                    rows={3}
                    value={motivo}
                    placeholder="Por qué hace falta entrar sin su permiso"
                    onChange={(e) => setMotivo(e.target.value)}
                />
                <div className="flex justify-end gap-2 mt-4">
                    <Button size="sm" onClick={() => setGlassFor(null)}>
                        Cancelar
                    </Button>
                    <Button
                        size="sm"
                        variant="solid"
                        color="red"
                        loading={pending}
                        disabled={motivo.trim().length < 10}
                        onClick={romper}
                    >
                        Romper y entrar
                    </Button>
                </div>
            </Dialog>
        </Card>
    )
}

export default PlatformOrgsClient
