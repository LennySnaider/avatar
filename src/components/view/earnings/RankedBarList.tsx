import Link from 'next/link'
import classNames from '@/utils/classNames'
import type { ReactNode } from 'react'

export interface RankedBarRow {
    key: string
    label: ReactNode
    /** Texto secundario bajo la etiqueta. */
    sub?: ReactNode
    value: number
    /** Valor ya formateado en su unidad. */
    display: string
    href?: string
}

interface RankedBarListProps {
    rows: RankedBarRow[]
    /** Un solo tono por lista (ranking nominal): Fanvue azul o Stars naranja. */
    tone: 'fanvue' | 'stars'
    emptyText?: string
}

const TONE_CLASS: Record<RankedBarListProps['tone'], string> = {
    fanvue: 'bg-[#2a85ff]',
    stars: 'bg-[#FE964A] dark:bg-[#ea580c]',
}

/**
 * Filas con barra proporcional (patrón de RevenueByChannel/TopProduct de la
 * plantilla). Un solo tono a propósito: el ranking es magnitud, no
 * categoría, y la paleta multicolor de la plantilla no pasa daltonismo.
 */
const RankedBarList = ({
    rows,
    tone,
    emptyText = 'Sin datos en este período.',
}: RankedBarListProps) => {
    if (rows.length === 0) {
        return <p className="text-sm text-gray-500">{emptyText}</p>
    }
    const max = Math.max(...rows.map((r) => r.value), 0)
    return (
        <div className="flex flex-col gap-3">
            {rows.map((row) => {
                const percent =
                    max > 0
                        ? Math.max(2, Math.round((row.value / max) * 100))
                        : 0
                const body = (
                    <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0 truncate heading-text font-semibold">
                                    {row.label}
                                </div>
                                <div className="shrink-0 font-bold heading-text">
                                    {row.display}
                                </div>
                            </div>
                            {row.sub && (
                                <div className="text-xs text-gray-500 mt-0.5">
                                    {row.sub}
                                </div>
                            )}
                            <div className="mt-1.5 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700">
                                <div
                                    className={classNames(
                                        'h-1.5 rounded-full',
                                        TONE_CLASS[tone],
                                    )}
                                    style={{ width: `${percent}%` }}
                                />
                            </div>
                        </div>
                    </div>
                )
                return row.href ? (
                    <Link
                        key={row.key}
                        href={row.href}
                        className="block rounded-lg -mx-2 px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    >
                        {body}
                    </Link>
                ) : (
                    <div key={row.key} className="py-1">
                        {body}
                    </div>
                )
            })}
        </div>
    )
}

export default RankedBarList
