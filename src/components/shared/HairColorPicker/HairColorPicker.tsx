'use client'

import { useEffect, useState } from 'react'
import Input from '@/components/ui/Input'
import Tooltip from '@/components/ui/Tooltip'
import ColorSwatchPicker, { type ColorSwatch } from '@/components/shared/ColorSwatchPicker'

export interface HairGradientPayload {
    /** Descriptor COMPUESTO que viaja al prompt (tipo + tonos + degradado). */
    hairColor: string
    /** Tonos ordenados raíces→puntas (máx 3) — estado para re-selección UI. */
    hairColors: string[]
    /** Textura (straight/wavy/curly/coily) o undefined = auto. */
    hairStyle?: string
}

interface HairColorPickerProps {
    value?: string
    onChange: (hairColor: string) => void
    /**
     * MODO DEGRADADO + TIPO: si está presente, los swatches se vuelven
     * multi-select (máx 3, orden de clic = raíces→puntas) y aparece el
     * selector de textura. Entrega hairColor compuesto + estado estructurado
     * en UNA sola llamada (evita dos setState con spread stale). `onChange`
     * NO se usa en este modo.
     */
    onGradientChange?: (payload: HairGradientPayload) => void
    /** Tonos guardados (medidas del avatar) para re-pintar la selección. */
    tones?: string[]
    /** Textura guardada. */
    hairStyle?: string
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

const ALL_COLORS = [...NATURAL_COLORS, ...FASHION_COLORS]
const KNOWN_VALUES = new Set(ALL_COLORS.map((c) => c.value))

const HAIR_STYLES: ReadonlyArray<{ value?: string; label: string }> = [
    { value: undefined, label: 'Auto' },
    { value: 'straight', label: 'Straight' },
    { value: 'wavy', label: 'Wavy' },
    { value: 'curly', label: 'Curly' },
    { value: 'coily', label: 'Coily' },
]

const toneLabel = (v: string): string =>
    ALL_COLORS.find((c) => c.value === v)?.label.toLowerCase() ??
    v.replace(/-/g, ' ')

/**
 * Compone el descriptor que viaja al prompt. Va por el mecanismo EXISTENTE de
 * `hairColor` como texto libre (getHairColorDescription le añade " hair"), así
 * que NINGÚN prompt builder cambia:
 *  1 tono  → el valor canónico del swatch (descripciones curadas intactas)
 *  2 tonos → "black roots melting into purple lengths and ends, ombre gradient"
 *  3 tonos → "… into purple mid-lengths and pink ends, ombre gradient"
 *  textura → prefijo ("wavy black roots …"). Custom text reemplaza los tonos.
 */
export function composeHairDescriptor(
    tones: string[],
    hairStyle?: string,
    customText?: string,
): string {
    const stylePrefix = hairStyle ? `${hairStyle} ` : ''
    const custom = customText?.trim()
    if (custom) return `${stylePrefix}${custom}`
    if (tones.length === 0) return hairStyle ?? ''
    if (tones.length === 1) {
        // Sin textura conserva el valor canónico (p.ej. 'purple') para que
        // bodyDescriptors use su descripción curada.
        return hairStyle ? `${stylePrefix}${toneLabel(tones[0])}` : tones[0]
    }
    const labels = tones.map(toneLabel)
    if (tones.length === 2) {
        return `${stylePrefix}${labels[0]} roots melting into ${labels[1]} lengths and ends, ombre gradient`
    }
    return `${stylePrefix}${labels[0]} roots melting into ${labels[1]} mid-lengths and ${labels[2]} ends, ombre gradient`
}

const HairColorPicker = ({
    value,
    onChange,
    onGradientChange,
    tones,
    hairStyle,
}: HairColorPickerProps) => {
    const [customText, setCustomText] = useState('')

    // Avatares legacy: solo traen `hairColor`. Si es un swatch conocido se
    // trata como el único tono; si es texto libre cae al input custom.
    const effectiveTones =
        tones && tones.length > 0
            ? tones
            : value && KNOWN_VALUES.has(value)
              ? [value]
              : []

    useEffect(() => {
        if (!onGradientChange) return
        if (value && !KNOWN_VALUES.has(value) && (!tones || tones.length === 0)) {
            setCustomText(value)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value])

    // Modo clásico (un solo color) — sin cambios de comportamiento.
    if (!onGradientChange) {
        return (
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
    }

    const emit = (nextTones: string[], nextStyle?: string, nextCustom?: string) => {
        onGradientChange({
            hairColor: composeHairDescriptor(nextTones, nextStyle, nextCustom),
            hairColors: nextTones,
            hairStyle: nextStyle,
        })
    }

    const toggleTone = (tone: string) => {
        // Elegir un swatch descarta el custom text (mismo trato que el picker clásico).
        setCustomText('')
        const next = effectiveTones.includes(tone)
            ? effectiveTones.filter((t) => t !== tone)
            : [...effectiveTones, tone].slice(0, 3)
        emit(next, hairStyle)
    }

    const swatchClass = (selected: boolean) =>
        `relative w-7 h-7 rounded-full border-2 transition-all ${
            selected
                ? 'ring-2 ring-primary ring-offset-2 scale-110'
                : 'border-gray-300 dark:border-gray-600 hover:scale-105'
        }`

    const renderRow = (colors: readonly ColorSwatch[], extraClass = '') => (
        <div className={`flex flex-wrap gap-2 ${extraClass}`}>
            {colors.map((c) => {
                const idx = effectiveTones.indexOf(c.value)
                return (
                    <Tooltip key={c.value} title={c.label}>
                        <button
                            type="button"
                            onClick={() => toggleTone(c.value)}
                            className={swatchClass(idx >= 0)}
                            style={{ backgroundColor: c.color }}
                        >
                            {idx >= 0 && effectiveTones.length > 1 && (
                                <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-primary text-white text-[8px] font-bold flex items-center justify-center">
                                    {idx + 1}
                                </span>
                            )}
                        </button>
                    </Tooltip>
                )
            })}
        </div>
    )

    const composed = composeHairDescriptor(effectiveTones, hairStyle, customText)

    return (
        <div>
            {/* Textura */}
            <label className="text-xs text-gray-500 block mb-1">Hair Type</label>
            <div className="flex flex-wrap gap-1 mb-3">
                {HAIR_STYLES.map((s) => (
                    <button
                        key={s.label}
                        type="button"
                        onClick={() => emit(effectiveTones, s.value, customText)}
                        className={`px-2 py-1 text-xs rounded border transition-colors ${
                            (hairStyle ?? undefined) === s.value
                                ? 'bg-primary text-white border-primary'
                                : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-primary'
                        }`}
                    >
                        {s.label}
                    </button>
                ))}
            </div>

            {/* Tonos (1 = raíces, 2-3 = medios/puntas) */}
            <label className="text-xs text-gray-500 block mb-2">
                Hair Color{' '}
                <span className="text-gray-400">
                    — up to 3 tones for ombre (1 = roots → last = ends)
                </span>
            </label>
            {renderRow(NATURAL_COLORS)}
            {renderRow(FASHION_COLORS, 'mt-2')}
            <div className="mt-3">
                <Input
                    size="sm"
                    placeholder="Other color (e.g. lavender, rose gold, mint)"
                    value={customText}
                    onChange={(e) => {
                        const next = e.target.value
                        setCustomText(next)
                        emit(next.trim() ? [] : effectiveTones, hairStyle, next)
                    }}
                />
            </div>
            <p className="text-xs text-gray-400 mt-2">
                Selected:{' '}
                <span className="capitalize text-primary">
                    {composed.replace(/-/g, ' ') || 'Brown'}
                </span>
            </p>
        </div>
    )
}

export default HairColorPicker
