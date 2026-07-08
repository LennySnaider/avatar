'use client'

import ColorSwatchPicker, { type ColorSwatch } from '@/components/shared/ColorSwatchPicker'

interface EyeColorPickerProps {
    value?: string
    onChange: (eyeColor: string) => void
}

const NATURAL_COLORS: readonly ColorSwatch[] = [
    { value: 'dark-brown', color: '#3b2314', label: 'Dark Brown' },
    { value: 'brown', color: '#6b4423', label: 'Brown' },
    { value: 'amber', color: '#b8732e', label: 'Amber' },
    { value: 'hazel', color: '#8e7618', label: 'Hazel' },
    { value: 'green', color: '#557a46', label: 'Green' },
    { value: 'blue', color: '#4a7fa5', label: 'Blue' },
    { value: 'light-blue', color: '#a7cfe0', label: 'Light Blue' },
    { value: 'gray', color: '#8b959e', label: 'Gray' },
]

const FASHION_COLORS: readonly ColorSwatch[] = [
    { value: 'violet', color: '#8b5fbf', label: 'Violet' },
    { value: 'aqua', color: '#3fbfbf', label: 'Aqua' },
    { value: 'red', color: '#a83232', label: 'Red' },
]

const EyeColorPicker = ({ value, onChange }: EyeColorPickerProps) => (
    <ColorSwatchPicker
        label="Eye Color"
        value={value}
        onChange={onChange}
        naturalColors={NATURAL_COLORS}
        fashionColors={FASHION_COLORS}
        customPlaceholder="Other color (e.g. amber, ice blue, teal)"
        fallbackLabel="Natural"
    />
)

export default EyeColorPicker
