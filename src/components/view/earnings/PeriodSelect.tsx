'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Select from '@/components/ui/Select'
import type { EarningsPreset } from '@/lib/earnings/period'
import { PRESET_OPTIONS } from './constants'
import { usePendingTransition } from './PendingFrame'

interface PeriodSelectProps {
    value: EarningsPreset
    className?: string
}

/**
 * El período vive en la URL (`?period=30d`): la página es server-rendered,
 * la URL se puede compartir y el ranking propaga el mismo período al abrir
 * un avatar. El valor local se actualiza al instante (optimista) y se
 * re-sincroniza con la prop cuando llega el nuevo render.
 */
const PeriodSelect = ({ value, className }: PeriodSelectProps) => {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const { startTransition } = usePendingTransition()
    const [selected, setSelected] = useState<EarningsPreset>(value)

    useEffect(() => {
        setSelected(value)
    }, [value])

    return (
        <Select
            instanceId="earnings-period"
            className={className ?? 'w-[150px]'}
            size="sm"
            placeholder="Período"
            isSearchable={false}
            options={PRESET_OPTIONS}
            value={PRESET_OPTIONS.filter((option) => option.value === selected)}
            onChange={(option) => {
                if (!option?.value || option.value === selected) return
                setSelected(option.value)
                const params = new URLSearchParams(searchParams.toString())
                params.set('period', option.value)
                startTransition(() => {
                    router.push(`${pathname}?${params.toString()}`)
                })
            }}
        />
    )
}

export default PeriodSelect
