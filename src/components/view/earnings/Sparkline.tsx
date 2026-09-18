interface SparklineProps {
    values: number[]
    /** Color hex del trazo. */
    color: string
    width?: number
    height?: number
    label?: string
}

/**
 * Sparkline en SVG inline, sin ApexCharts: una gráfica por fila del ranking
 * serían N instancias con N listeners de resize; un `<svg>` se renderiza en
 * el servidor y no mueve el layout.
 */
const Sparkline = ({
    values,
    color,
    width = 96,
    height = 28,
    label,
}: SparklineProps) => {
    const n = values.length
    if (n === 0) {
        return <span className="text-gray-400 text-xs">—</span>
    }
    const max = Math.max(...values, 0)
    const pad = 3
    const innerW = width - pad * 2
    const innerH = height - pad * 2
    const stepX = n > 1 ? innerW / (n - 1) : 0
    const points = values.map((v, i) => {
        const x = pad + i * stepX
        const y = max > 0 ? pad + innerH - (v / max) * innerH : pad + innerH
        return [x, y] as const
    })
    const line = points
        .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
        .join(' ')
    const first = points[0]
    const last = points[points.length - 1]
    const area = `M${first[0].toFixed(1)},${(pad + innerH).toFixed(1)} L${line
        .split(' ')
        .map((p) => p)
        .join(' L')} L${last[0].toFixed(1)},${(pad + innerH).toFixed(1)} Z`

    return (
        <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={label ?? 'Tendencia'}
            className="overflow-visible"
        >
            <title>{label ?? 'Tendencia'}</title>
            <path d={area} fill={color} fillOpacity={0.1} />
            <polyline
                points={line}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
            />
            <circle
                cx={last[0]}
                cy={last[1]}
                r={2.5}
                fill={color}
                className="stroke-white dark:stroke-gray-800"
                strokeWidth={2}
            />
        </svg>
    )
}

export default Sparkline
