'use client'

import Slider from '@/components/ui/Slider'
import Input from '@/components/ui/Input'

/**
 * Medida con slider + número SINCRONIZADOS en la misma fila (patrón pedido
 * por el usuario): el slider cubre el rango realista y el input de al lado se
 * incrementa/disminuye en vivo al moverlo; escribir en el input permite
 * valores fuera de rango (el slider solo se satura visualmente — el valor
 * real siempre es el del número).
 */
const MeasurementSlider = ({
    label,
    value,
    min,
    max,
    unit,
    hint,
    onChange,
}: {
    label: string
    value: number
    min: number
    max: number
    unit?: string
    /** Texto contextual a la derecha del label (p.ej. talla EU/ES del cm). */
    hint?: string
    onChange: (value: number) => void
}) => (
    <div>
        <div className="flex items-center justify-between mb-0.5">
            <label className="text-xs text-gray-500">
                {label}
                {unit ? (
                    <span className="text-gray-400"> ({unit})</span>
                ) : null}
            </label>
            {hint ? (
                <span className="text-[10px] text-gray-400">{hint}</span>
            ) : null}
        </div>
        <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
                <Slider
                    value={Math.min(max, Math.max(min, value))}
                    onChange={(v) => onChange(v as number)}
                    min={min}
                    max={max}
                />
            </div>
            <Input
                size="sm"
                type="number"
                className="w-16 shrink-0 text-right py-0.5 px-1.5"
                value={value}
                onChange={(e) => {
                    const n = parseInt(e.target.value)
                    onChange(Number.isFinite(n) ? n : min)
                }}
            />
        </div>
    </div>
)

export default MeasurementSlider
