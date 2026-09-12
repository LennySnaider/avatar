'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Alert from '@/components/ui/Alert'
import Tag from '@/components/ui/Tag'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { installModule, uninstallModule } from '@/services/ModulesService'
import type { ModuleCatalogRow } from '@/lib/modules/catalog'
import type { OrgModuleRow } from '@/lib/modules/entitlements'

const UNIT_LABEL: Record<string, string> = {
    bot: 'bot',
    avatar: 'avatar',
    org: 'organización',
}

/**
 * Módulos con funcionalidad real detrás de la tarjeta. El catálogo puede
 * sembrar un módulo (precio, comisiones) antes de que exista una sola línea
 * de código para él — es lo que pasó con `telegram` — y la tarjeta no puede
 * dejar que eso se confunda con "instalar esto activa algo". `telegram` sale
 * de este set el día que aterrice su canal (ver docs/superpowers/specs/
 * 2026-09-11-telegram-telestars-module-design.md); hasta entonces se anuncia
 * pero se marca "Próximamente".
 *
 * Deliberadamente NO es una columna de `module_catalog`: es un hecho sobre el
 * REPOSITORIO (¿existe el código?), no sobre los datos.
 */
const AVAILABLE_MODULES = new Set<string>([])

interface Props {
    catalog: ModuleCatalogRow[]
    installed: OrgModuleRow[]
    canManage: boolean
}

export default function ModulesClient({ catalog, installed, canManage }: Props) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [confirmSlug, setConfirmSlug] = useState<string | null>(null)

    const statusOf = (slug: string) =>
        installed.find((m) => m.moduleSlug === slug)?.status ?? 'uninstalled'

    const notify = (type: 'success' | 'danger', message: string) => {
        toast.push(<Notification type={type}>{message}</Notification>)
    }

    const run = (action: () => Promise<{ success: boolean; error?: string }>, okMessage: string) => {
        startTransition(async () => {
            const res = await action()
            if (res.success) {
                notify('success', okMessage)
                router.refresh()
            } else {
                notify('danger', res.error ?? 'No se pudo completar la acción.')
            }
        })
    }

    const confirmModule = catalog.find((m) => m.slug === confirmSlug)

    return (
        <div className="flex flex-col gap-4">
            <h3>Módulos</h3>
            <Alert type="info" showIcon>
                Todavía no hay pasarela de pagos conectada. Instalar un módulo lo activa y registra
                sus cuotas y comisiones en tu saldo a modo de medición; el cobro real se activará
                cuando exista la facturación.
            </Alert>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {catalog.map((mod) => {
                    const status = statusOf(mod.slug)
                    const isInstalled = status === 'installed'
                    const comingSoon = !AVAILABLE_MODULES.has(mod.slug)
                    return (
                        <Card key={mod.slug}>
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h5>{mod.name}</h5>
                                        {isInstalled && <Tag className="bg-emerald-100 text-emerald-700">Instalado</Tag>}
                                        {status === 'suspended' && (
                                            <Tag className="bg-amber-100 text-amber-700">Suspendido</Tag>
                                        )}
                                        {comingSoon && (
                                            <Tag className="bg-indigo-100 text-indigo-700">Próximamente</Tag>
                                        )}
                                    </div>
                                    <p className="mt-1">{mod.description}</p>
                                </div>
                            </div>

                            <div className="mt-4 flex flex-col gap-1">
                                <span>
                                    ${mod.priceUsdMonthPerUnit.toFixed(2)} / {UNIT_LABEL[mod.unit] ?? mod.unit} / mes
                                </span>
                                <span>
                                    Comisión: {mod.commissionAiPct}% en ventas de la IA ·{' '}
                                    {mod.commissionManualPct}% en ventas manuales
                                </span>
                            </div>

                            <div className="mt-4">
                                {isInstalled ? (
                                    <Button
                                        variant="plain"
                                        disabled={!canManage || pending}
                                        onClick={() => setConfirmSlug(mod.slug)}
                                    >
                                        Desinstalar
                                    </Button>
                                ) : (
                                    <Button
                                        variant="solid"
                                        disabled={!canManage || pending}
                                        onClick={() =>
                                            run(() => installModule(mod.slug), `${mod.name} instalado.`)
                                        }
                                    >
                                        Instalar
                                    </Button>
                                )}
                                {!canManage && (
                                    <p className="mt-2">
                                        Sólo el propietario o un administrador pueden gestionar módulos.
                                    </p>
                                )}
                            </div>
                        </Card>
                    )
                })}
            </div>

            <ConfirmDialog
                isOpen={Boolean(confirmSlug)}
                type="danger"
                title={`Desinstalar ${confirmModule?.name ?? ''}`}
                confirmButtonProps={{ loading: pending }}
                onClose={() => setConfirmSlug(null)}
                onRequestClose={() => setConfirmSlug(null)}
                onCancel={() => setConfirmSlug(null)}
                onConfirm={() => {
                    const slug = confirmSlug
                    setConfirmSlug(null)
                    if (slug) {
                        run(() => uninstallModule(slug), 'Módulo desinstalado.')
                    }
                }}
            >
                <p>
                    Las funciones del módulo dejarán de estar disponibles y sus automatismos se
                    detendrán. No se borra ningún dato: puedes volver a instalarlo cuando quieras.
                </p>
            </ConfirmDialog>
        </div>
    )
}
