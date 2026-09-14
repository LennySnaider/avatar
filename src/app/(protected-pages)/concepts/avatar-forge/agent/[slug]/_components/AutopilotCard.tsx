'use client'

import { useEffect, useState } from 'react'
import Alert from '@/components/ui/Alert'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Switcher from '@/components/ui/Switcher'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { getAutopilotConfig, setAutopilotConfig } from '@/services/AgentInboxService'
import type { AutopilotConfig } from '@/lib/agent/autopilot'

interface AutopilotCardProps {
    avatarId: string
}

const AutopilotCard = ({ avatarId }: AutopilotCardProps) => {
    const [loaded, setLoaded] = useState(false)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [enabled, setEnabled] = useState(false)
    const [start, setStart] = useState('09:00')
    const [end, setEnd] = useState('23:00')
    const [timezone, setTimezone] = useState(
        Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    )
    const [delayMin, setDelayMin] = useState('30')
    const [delayMax, setDelayMax] = useState('180')
    const [dailyLimit, setDailyLimit] = useState('40')
    const [allowPaidMediaOffers, setAllowPaidMediaOffers] = useState(false)
    const [maxOfferStars, setMaxOfferStars] = useState('')
    const [offerCooldownHours, setOfferCooldownHours] = useState('')
    const [isSaving, setIsSaving] = useState(false)

    // Una carga fallida NO puede tratarse como "sin configuración": los
    // valores del formulario se quedarían en sus defaults y el siguiente
    // "Save autopilot" los guardaría encima de la configuración real,
    // borrando los topes de dinero del creador. Si no se pudo leer, se dice
    // y se bloquea el guardado.
    useEffect(() => {
        getAutopilotConfig(avatarId)
            .then((r) => {
                if (!r.success) {
                    console.error('[autopilot] no se pudo cargar la configuración', {
                        avatarId,
                        error: r.error,
                    })
                    setLoadError(r.error ?? 'No se pudo cargar la configuración')
                    setLoaded(true)
                    return
                }
                const c = r.data ?? {}
                setEnabled(!!c.enabled)
                if (c.activeHours?.start) setStart(c.activeHours.start)
                if (c.activeHours?.end) setEnd(c.activeHours.end)
                if (c.activeHours?.timezone) setTimezone(c.activeHours.timezone)
                if (c.delaySecondsMin != null) setDelayMin(String(c.delaySecondsMin))
                if (c.delaySecondsMax != null) setDelayMax(String(c.delaySecondsMax))
                if (c.dailyMessageLimit != null) setDailyLimit(String(c.dailyMessageLimit))
                setAllowPaidMediaOffers(!!c.allowPaidMediaOffers)
                if (c.maxOfferStars != null) setMaxOfferStars(String(c.maxOfferStars))
                if (c.offerCooldownHours != null) setOfferCooldownHours(String(c.offerCooldownHours))
                setLoaded(true)
            })
            .catch((e) => {
                console.error('[autopilot] no se pudo cargar la configuración', { avatarId }, e)
                setLoadError(e instanceof Error ? e.message : 'No se pudo cargar la configuración')
                setLoaded(true)
            })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleSave = async () => {
        setIsSaving(true)
        try {
            const config: AutopilotConfig = {
                enabled,
                activeHours: { start, end, timezone },
                delaySecondsMin: Math.max(0, Number(delayMin) || 0),
                delaySecondsMax: Math.max(0, Number(delayMax) || 0),
                dailyMessageLimit: Math.max(0, Number(dailyLimit) || 0),
                // Safety escalations are ALWAYS on (hard-coded in the classifier).
                escalate: { payment: true, complaint: true, sensitive: true, minors: true },
                allowPaidMediaOffers,
                // VACÍO ≠ CERO. Vacío es "sin tope" / "usa el default de 6 h"
                // y viaja como `undefined`, que `JSON.stringify` borra del
                // objeto antes de que `setAutopilotConfig` reemplace el jsonb
                // entero: el campo queda AUSENTE en la base, que es
                // exactamente lo que `parseAutopilot` lee como "no puesto".
                // Un 0 escrito a mano sí es una orden: "no ofrezcas nada" y
                // "sin enfriamiento" respectivamente.
                maxOfferStars: maxOfferStars.trim() === '' ? undefined : Math.max(0, Number(maxOfferStars) || 0),
                offerCooldownHours:
                    offerCooldownHours.trim() === '' ? undefined : Math.max(0, Number(offerCooldownHours) || 0),
            }
            const result = await setAutopilotConfig(avatarId, config)
            toast.push(
                result.success ? (
                    <Notification type="success" title="Autopilot saved">
                        Applies to chats you switch to “Auto” in the Inbox
                    </Notification>
                ) : (
                    <Notification type="danger" title="Failed">
                        {result.error}
                    </Notification>
                ),
            )
        } finally {
            setIsSaving(false)
        }
    }

    if (!loaded) {
        return (
            <Card className="max-w-4xl mt-4">
                <p className="text-sm text-gray-500">Loading autopilot…</p>
            </Card>
        )
    }

    return (
        <Card className="max-w-4xl mt-4">
            {loadError && (
                <Alert type="danger" showIcon className="mb-3">
                    No se pudo cargar la configuración de autopilot ({loadError}). Guardar está
                    desactivado para no escribir valores por defecto encima de la tuya — recarga la
                    página.
                </Alert>
            )}
            <div className="flex items-center gap-3 mb-2">
                <Switcher checked={enabled} onChange={(c) => setEnabled(c)} />
                <div>
                    <p className="text-sm font-semibold">Autopilot</p>
                    <p className="text-xs text-gray-400">
                        When ON, chats set to “Auto” send safe replies by themselves with a
                        human-like delay. You stay in control of everything else.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
                <div>
                    <p className="text-xs text-gray-500 mb-1">Active from</p>
                    <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
                </div>
                <div>
                    <p className="text-xs text-gray-500 mb-1">Active until</p>
                    <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
                </div>
                <div>
                    <p className="text-xs text-gray-500 mb-1">Timezone</p>
                    <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
                </div>
                <div>
                    <p className="text-xs text-gray-500 mb-1">Min delay (sec)</p>
                    <Input type="number" value={delayMin} onChange={(e) => setDelayMin(e.target.value)} />
                </div>
                <div>
                    <p className="text-xs text-gray-500 mb-1">Max delay (sec)</p>
                    <Input type="number" value={delayMax} onChange={(e) => setDelayMax(e.target.value)} />
                </div>
                <div>
                    <p className="text-xs text-gray-500 mb-1">Daily send limit</p>
                    <Input type="number" value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} />
                </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                <p className="text-sm font-semibold mb-1">Telegram offers</p>
                <p className="text-xs text-gray-400 mb-3">
                    Whether a Telegram autopilot reply may carry a paid content offer by itself, and how
                    much it can offer without you.
                </p>
                <div className="flex items-center justify-between gap-3 mb-3">
                    <p className="text-sm">Allow paid offers on autopilot</p>
                    <Switcher
                        checked={allowPaidMediaOffers}
                        onChange={(c) => setAllowPaidMediaOffers(c)}
                    />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <p className="text-xs text-gray-500 mb-1">Max Stars the AI may offer</p>
                        <Input
                            type="number"
                            placeholder="no limit"
                            value={maxOfferStars}
                            onChange={(e) => setMaxOfferStars(e.target.value)}
                        />
                        <p className="text-[11px] text-gray-400 mt-1">
                            Empty = no limit. 0 = the AI offers nothing.
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 mb-1">Hours between offers</p>
                        <Input
                            type="number"
                            placeholder="6"
                            value={offerCooldownHours}
                            onChange={(e) => setOfferCooldownHours(e.target.value)}
                        />
                        <p className="text-[11px] text-gray-400 mt-1">
                            Empty = every 6 h. 0 = no wait between offers.
                        </p>
                    </div>
                </div>
            </div>

            <p className="text-xs text-amber-600 dark:text-amber-400 mt-3">
                🛡️ Always escalated to you (never auto-sent): payment/refund issues, complaints,
                sensitive topics, and anything hinting at a minor.
            </p>

            <div className="flex justify-end mt-3">
                <Button
                    variant="solid"
                    size="sm"
                    loading={isSaving}
                    disabled={loadError !== null}
                    onClick={handleSave}
                >
                    Save autopilot
                </Button>
            </div>
        </Card>
    )
}

export default AutopilotCard
