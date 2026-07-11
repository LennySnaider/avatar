'use client'

import { useEffect, useState } from 'react'
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
    const [enabled, setEnabled] = useState(false)
    const [start, setStart] = useState('09:00')
    const [end, setEnd] = useState('23:00')
    const [timezone, setTimezone] = useState(
        Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    )
    const [delayMin, setDelayMin] = useState('30')
    const [delayMax, setDelayMax] = useState('180')
    const [dailyLimit, setDailyLimit] = useState('40')
    const [isSaving, setIsSaving] = useState(false)

    useEffect(() => {
        getAutopilotConfig(avatarId).then((r) => {
            const c = r.success ? (r.data ?? {}) : {}
            setEnabled(!!c.enabled)
            if (c.activeHours?.start) setStart(c.activeHours.start)
            if (c.activeHours?.end) setEnd(c.activeHours.end)
            if (c.activeHours?.timezone) setTimezone(c.activeHours.timezone)
            if (c.delaySecondsMin != null) setDelayMin(String(c.delaySecondsMin))
            if (c.delaySecondsMax != null) setDelayMax(String(c.delaySecondsMax))
            if (c.dailyMessageLimit != null) setDailyLimit(String(c.dailyMessageLimit))
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

            <p className="text-xs text-amber-600 dark:text-amber-400 mt-3">
                🛡️ Always escalated to you (never auto-sent): payment/refund issues, complaints,
                sensitive topics, and anything hinting at a minor.
            </p>

            <div className="flex justify-end mt-3">
                <Button variant="solid" size="sm" loading={isSaving} onClick={handleSave}>
                    Save autopilot
                </Button>
            </div>
        </Card>
    )
}

export default AutopilotCard
