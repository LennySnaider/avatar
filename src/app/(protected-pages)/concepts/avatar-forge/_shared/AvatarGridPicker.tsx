'use client'

import { HiOutlineUser, HiOutlineCheck } from 'react-icons/hi'

export interface AvatarGridItem {
    id: string
    name: string
    thumbnailUrl?: string | null
    /** Línea secundaria opcional bajo el nombre (p.ej. "3 refs"). */
    subtitle?: string
}

interface AvatarGridPickerProps {
    items: AvatarGridItem[]
    /** Resaltado verde + check (elección en curso). */
    selectedId?: string | null
    /** Resaltado primary (el avatar actualmente cargado en el Studio). */
    currentId?: string | null
    disabled?: boolean
    onPick: (item: AvatarGridItem) => void
    /** Clases del grid (default: 2 cols en móvil, 3 en sm+). */
    gridClassName?: string
}

/**
 * Grid de avatares estilo Flow Builder (foto cuadrada + nombre en gradiente +
 * check) — fuente ÚNICA de la UI de selección de avatar. Lo usan el
 * AvatarPickerField del Flow Builder y el AvatarSelector del Studio (DRY);
 * cada caller conserva su Dialog, carga de datos y acciones (p.ej. Create New).
 */
const AvatarGridPicker = ({
    items,
    selectedId,
    currentId,
    disabled = false,
    onPick,
    gridClassName = 'grid grid-cols-2 sm:grid-cols-3 gap-3',
}: AvatarGridPickerProps) => (
    <div className={gridClassName}>
        {items.map((item) => {
            const isSelected = selectedId === item.id
            const isCurrent = currentId === item.id
            return (
                <button
                    key={item.id}
                    type="button"
                    onClick={() => onPick(item)}
                    disabled={disabled}
                    className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                        isSelected
                            ? 'border-emerald-500'
                            : isCurrent
                              ? 'border-primary'
                              : 'border-transparent hover:border-gray-300 dark:hover:border-gray-600'
                    } ${disabled ? 'opacity-50 cursor-wait' : ''}`}
                >
                    {item.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={item.thumbnailUrl}
                            alt={item.name}
                            className="w-full aspect-square object-cover"
                            loading="lazy"
                            decoding="async"
                        />
                    ) : (
                        <div className="w-full aspect-square bg-gray-200 dark:bg-gray-800 flex items-center justify-center">
                            <HiOutlineUser className="w-10 h-10 text-gray-400" />
                        </div>
                    )}
                    <div className="absolute bottom-0 inset-x-0 bg-linear-to-t from-black/80 to-transparent p-2 text-left">
                        <div className="text-white text-xs font-medium truncate">
                            {item.name}
                        </div>
                        {item.subtitle && (
                            <div className="text-[10px] text-gray-300 truncate">
                                {item.subtitle}
                            </div>
                        )}
                    </div>
                    {(isSelected || isCurrent) && (
                        <div
                            className={`absolute top-1 right-1 rounded-full p-0.5 ${
                                isSelected ? 'bg-emerald-500' : 'bg-primary'
                            }`}
                        >
                            <HiOutlineCheck className="w-3 h-3 text-white" />
                        </div>
                    )}
                </button>
            )
        })}
    </div>
)

export default AvatarGridPicker
