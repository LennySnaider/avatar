import Tooltip from '@/components/ui/Tooltip'
import GrowShrinkValue from '@/components/shared/GrowShrinkValue'
import classNames from '@/utils/classNames'

interface DeltaBadgeProps {
    /** Variación en %. null = sin base de comparación. */
    value: number | null
    className?: string
}

/**
 * Envuelve `GrowShrinkValue`, que pinta el 0 como negativo (rojo) y no sabe
 * de "sin datos": aquí null → "—" con tooltip y 0 → gris neutro.
 */
const DeltaBadge = ({ value, className }: DeltaBadgeProps) => {
    if (value === null || Number.isNaN(value)) {
        return (
            <Tooltip title="Sin datos del período anterior">
                <span
                    className={classNames(
                        'text-gray-400 font-semibold',
                        className,
                    )}
                >
                    —
                </span>
            </Tooltip>
        )
    }
    if (value === 0) {
        return (
            <span
                className={classNames('text-gray-500 font-semibold', className)}
            >
                0%
            </span>
        )
    }
    return (
        <GrowShrinkValue
            className={classNames('font-bold', className)}
            value={Math.round(value * 10) / 10}
            suffix="%"
            positiveIcon="+"
            negativeIcon=""
        />
    )
}

export default DeltaBadge
