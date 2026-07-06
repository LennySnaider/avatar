'use client'

import { useEffect, useState } from 'react'
import Input from '@/components/ui/Input'
import Tooltip from '@/components/ui/Tooltip'

interface HairColorPickerProps {
    value?: string
    onChange: (hairColor: string) => void
}

const NATURAL_COLORS = [
    { value: 'black', color: '#0a0a0a', label: 'Black' },
    { value: 'dark-brown', color: '#3b2314', label: 'Dark Brown' },
    { value: 'brown', color: '#6b4423', label: 'Brown' },
    { value: 'light-brown', color: '#a0522d', label: 'Light Brown' },
    { value: 'dark-blonde', color: '#b8860b', label: 'Dark Blonde' },
    { value: 'blonde', color: '#daa520', label: 'Blonde' },
    { value: 'platinum-blonde', color: '#f5f5dc', label: 'Platinum' },
    { value: 'red', color: '#8b0000', label: 'Red' },
    { value: 'auburn', color: '#a52a2a', label: 'Auburn' },
    { value: 'ginger', color: '#ff6347', label: 'Ginger' },
    { value: 'gray', color: '#808080', label: 'Gray' },
    { value: 'silver', color: '#c0c0c0', label: 'Silver' },
    { value: 'white', color: '#f8f8ff', label: 'White' },
] as const

const FASHION_COLORS = [
    { value: 'purple', color: '#8b3fd1', label: 'Purple' },
    { value: 'pink', color: '#ff69b4', label: 'Pink' },
    { value: 'blue', color: '#4a90d9', label: 'Blue' },
    { value: 'green', color: '#3cb371', label: 'Green' },
    { value: 'teal', color: '#20b2aa', label: 'Teal' },
    { value: 'lavender', color: '#b57edc', label: 'Lavender' },
    { value: 'rose-gold', color: '#b76e79', label: 'Rose Gold' },
    { value: 'burgundy', color: '#800020', label: 'Burgundy' },
] as const

const KNOWN_VALUES = new Set<string>([
    ...NATURAL_COLORS.map((c) => c.value),
    ...FASHION_COLORS.map((c) => c.value),
])

/**
 * Hair color selector shared by the avatar editors and creator. Natural +
 * fashion swatches, plus a free-text field for any custom color. The value is
 * a plain string (a swatch value or free text) that flows straight into the
 * generation prompt via getHairColorDescription's `"<name> hair"` fallback,
 * so a hex code is intentionally NOT used — the prompt needs a name.
 */
const HairColorPicker = ({ value, onChange }: HairColorPickerProps) => {
    const [customText, setCustomText] = useState('')

    // Mirror an externally-set custom value (e.g. loaded from a saved avatar)
    // into the text field so it's visible and editable.
    useEffect(() => {
        if (value && !KNOWN_VALUES.has(value)) setCustomText(value)
    }, [value])

    const swatchClass = (selected: boolean) =>
        `w-7 h-7 rounded-full border-2 transition-all ${
            selected
                ? 'ring-2 ring-primary ring-offset-2 scale-110'
                : 'border-gray-300 dark:border-gray-600 hover:scale-105'
        }`

    return (
        <div>
            <label className="text-xs text-gray-500 block mb-2">Hair Color</label>

            {/* Natural colors */}
            <div className="flex flex-wrap gap-2">
                {NATURAL_COLORS.map((hair) => (
                    <Tooltip key={hair.value} title={hair.label}>
                        <button
                            type="button"
                            onClick={() => onChange(hair.value)}
                            className={swatchClass(value === hair.value)}
                            style={{ backgroundColor: hair.color }}
                        />
                    </Tooltip>
                ))}
            </div>

            {/* Fashion colors */}
            <div className="flex flex-wrap gap-2 mt-2">
                {FASHION_COLORS.map((hair) => (
                    <Tooltip key={hair.value} title={hair.label}>
                        <button
                            type="button"
                            onClick={() => onChange(hair.value)}
                            className={swatchClass(value === hair.value)}
                            style={{ backgroundColor: hair.color }}
                        />
                    </Tooltip>
                ))}
            </div>

            {/* Custom free-text color */}
            <div className="mt-3">
                <Input
                    size="sm"
                    placeholder="Other color (e.g. lavender, rose gold, mint)"
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
                    {value?.replace(/-/g, ' ') || 'Brown'}
                </span>
            </p>
        </div>
    )
}

export default HairColorPicker
