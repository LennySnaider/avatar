'use client'

import { useEffect, useState } from 'react'
import Input from '@/components/ui/Input'
import Tooltip from '@/components/ui/Tooltip'

export interface ColorSwatch {
    value: string
    color: string
    label: string
}

interface ColorSwatchPickerProps {
    label: string
    value?: string
    onChange: (value: string) => void
    naturalColors: readonly ColorSwatch[]
    fashionColors: readonly ColorSwatch[]
    customPlaceholder: string
    /** Shown in the "Selected:" line when no value is set. */
    fallbackLabel: string
}

/**
 * Generic swatch color selector: a row of natural colors, a row of fashion
 * colors, and a free-text field for any custom color. The value is a plain
 * string (a swatch value or free text) that flows into the generation prompt
 * via a "<name> hair/eyes" descriptor — so a hex code is intentionally NOT
 * used, the prompt needs a name. Powers HairColorPicker and EyeColorPicker.
 */
const ColorSwatchPicker = ({
    label,
    value,
    onChange,
    naturalColors,
    fashionColors,
    customPlaceholder,
    fallbackLabel,
}: ColorSwatchPickerProps) => {
    const [customText, setCustomText] = useState('')

    const knownValues = new Set<string>([
        ...naturalColors.map((c) => c.value),
        ...fashionColors.map((c) => c.value),
    ])

    // Mirror an externally-set custom value (e.g. loaded from a saved avatar)
    // into the text field so it's visible and editable.
    useEffect(() => {
        if (value && !knownValues.has(value)) setCustomText(value)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value])

    const swatchClass = (selected: boolean) =>
        `w-7 h-7 rounded-full border-2 transition-all ${
            selected
                ? 'ring-2 ring-primary ring-offset-2 scale-110'
                : 'border-gray-300 dark:border-gray-600 hover:scale-105'
        }`

    const renderRow = (colors: readonly ColorSwatch[], extraClass = '') => (
        <div className={`flex flex-wrap gap-2 ${extraClass}`}>
            {colors.map((c) => (
                <Tooltip key={c.value} title={c.label}>
                    <button
                        type="button"
                        onClick={() => onChange(c.value)}
                        className={swatchClass(value === c.value)}
                        style={{ backgroundColor: c.color }}
                    />
                </Tooltip>
            ))}
        </div>
    )

    return (
        <div>
            <label className="text-xs text-gray-500 block mb-2">{label}</label>
            {renderRow(naturalColors)}
            {renderRow(fashionColors, 'mt-2')}
            <div className="mt-3">
                <Input
                    size="sm"
                    placeholder={customPlaceholder}
                    value={customText}
                    onChange={(e) => {
                        const next = e.target.value
                        setCustomText(next)
                        onChange(next.trim())
                    }}
                />
            </div>
            <p className="text-xs text-gray-400 mt-2">
                Selected:{' '}
                <span className="capitalize text-primary">
                    {value?.replace(/-/g, ' ') || fallbackLabel}
                </span>
            </p>
        </div>
    )
}

export default ColorSwatchPicker
