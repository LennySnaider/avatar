'use client'

/**
 * Editor de APARIENCIA (piel / pelo / ojos) — extraído de PhysicalAttributesEditor
 * para poder colocarlo junto a las referencias de CARA en el drawer (agrupa todo
 * lo de la cara/identidad), separado de los atributos de CUERPO. `value + onChange`
 * puro (store-agnóstico), igual patrón que PhysicalAttributesEditor.
 */

import Slider from '@/components/ui/Slider'
import HairColorPicker from '@/components/shared/HairColorPicker'
import EyeColorPicker from '@/components/shared/EyeColorPicker'
import type { HairLength, PhysicalMeasurements } from '@/@types/supabase'
import { HAIR_LENGTH_LABEL } from '@/utils/bodyDescriptors'

interface AppearanceEditorProps {
    measurements: PhysicalMeasurements
    onChange: (measurements: PhysicalMeasurements) => void
}

const SKIN_TONE_LABEL = (t?: number): string =>
    t === 1
        ? 'Very Fair'
        : t === 2
          ? 'Fair'
          : t === 3
            ? 'Light'
            : t === 4
              ? 'Light-Medium'
              : t === 5
                ? 'Medium'
                : t === 6
                  ? 'Medium-Tan'
                  : t === 7
                    ? 'Tan'
                    : t === 8
                      ? 'Dark'
                      : 'Very Dark'

const SKIN_TONE_HEX: Record<number, string> = {
    1: '#FFECD2',
    2: '#FFE4C4',
    3: '#F5D5B8',
    4: '#E8C4A0',
    5: '#D4A574',
    6: '#C68642',
    7: '#A0522D',
    8: '#6B4423',
    9: '#3D2314',
}

const AppearanceEditor = ({
    measurements,
    onChange,
}: AppearanceEditorProps) => {
    const set = (patch: Partial<PhysicalMeasurements>) =>
        onChange({ ...measurements, ...patch })

    return (
        <div className="space-y-4">
            {/* Skin Tone Slider */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-gray-500">Skin Tone</label>
                    <span className="text-xs font-mono text-primary">
                        {SKIN_TONE_LABEL(measurements.skinTone)}
                    </span>
                </div>
                {/* Visual skin tone gradient */}
                <div className="relative mb-1">
                    <div className="h-3 rounded-full overflow-hidden flex">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((tone) => (
                            <button
                                key={tone}
                                onClick={() =>
                                    set({
                                        skinTone: tone as
                                            | 1
                                            | 2
                                            | 3
                                            | 4
                                            | 5
                                            | 6
                                            | 7
                                            | 8
                                            | 9,
                                    })
                                }
                                className={`flex-1 transition-all ${
                                    measurements.skinTone === tone
                                        ? 'ring-2 ring-primary ring-offset-1 z-10 scale-110'
                                        : ''
                                }`}
                                style={{
                                    backgroundColor: SKIN_TONE_HEX[tone],
                                }}
                                title={SKIN_TONE_LABEL(tone)}
                            />
                        ))}
                    </div>
                </div>
                <Slider
                    value={measurements.skinTone || 5}
                    onChange={(val) =>
                        set({
                            skinTone: val as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
                        })
                    }
                    min={1}
                    max={9}
                    step={1}
                />
            </div>

            {/* Hair Type + Color (degradado 2-3 tonos) */}
            <HairColorPicker
                value={measurements.hairColor}
                tones={measurements.hairColors}
                hairStyle={measurements.hairStyle}
                onChange={(c) => set({ hairColor: c })}
                onGradientChange={(p) => set({ ...p })}
            />

            {/* Largo de cabello (1 rapado … 7 pasando la cintura). Va junto al
                color/tipo: los tres componen el descriptor de pelo que viaja a
                los prompts (describeHair). */}
            <div>
                <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">
                        Largo de cabello
                    </span>
                    <span className="text-xs font-mono text-primary">
                        {HAIR_LENGTH_LABEL[measurements.hairLength ?? 4]}
                    </span>
                </div>
                <Slider
                    value={measurements.hairLength ?? 4}
                    onChange={(val) =>
                        set({ hairLength: val as number as HairLength })
                    }
                    min={1}
                    max={7}
                    step={1}
                />
                <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                    <span>Rapado</span>
                    <span>Pasando la cintura</span>
                </div>
            </div>

            {/* Eye Color */}
            <EyeColorPicker
                value={measurements.eyeColor}
                onChange={(c) => set({ eyeColor: c })}
            />
        </div>
    )
}

export default AppearanceEditor
