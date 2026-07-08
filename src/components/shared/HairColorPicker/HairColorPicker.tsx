'use client'

import ColorSwatchPicker, { type ColorSwatch } from '@/components/shared/ColorSwatchPicker'

interface HairColorPickerProps {
    value?: string
    onChange: (hairColor: string) => void
}

const NATURAL_COLORS: readonly ColorSwatch[] = [
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
]

const FASHION_COLORS: readonly ColorSwatch[] = [
    { value: 'purple', color: '#8b3fd1', label: 'Purple' },
    { value: 'pink', color: '#ff69b4', label: 'Pink' },
    { value: 'blue', color: '#4a90d9', label: 'Blue' },
    { value: 'green', color: '#3cb371', label: 'Green' },
    { value: 'teal', color: '#20b2aa', label: 'Teal' },
    { value: 'lavender', color: '#b57edc', label: 'Lavender' },
    { value: 'rose-gold', color: '#b76e79', label: 'Rose Gold' },
    { value: 'burgundy', color: '#800020', label: 'Burgundy' },
]

const HairColorPicker = ({ value, onChange }: HairColorPickerProps) => (
    <ColorSwatchPicker
        label="Hair Color"
        value={value}
        onChange={onChange}
        naturalColors={NATURAL_COLORS}
        fashionColors={FASHION_COLORS}
        customPlaceholder="Other color (e.g. lavender, rose gold, mint)"
        fallbackLabel="Brown"
    />
)

export default HairColorPicker
