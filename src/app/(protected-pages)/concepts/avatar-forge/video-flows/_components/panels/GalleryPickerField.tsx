'use client'

import { useEffect, useState } from 'react'
import Dialog from '@/components/ui/Dialog'
import Spinner from '@/components/ui/Spinner'
import { HiOutlineCollection, HiOutlineCheck, HiOutlineFilm } from 'react-icons/hi'
import { apiGetGenerations } from '@/services/AvatarForgeService'
import { getStoragePublicUrl } from '@/lib/supabase'
import type { Generation } from '@/@types/supabase'

interface GalleryPickerValue {
    generationId?: string | null
    url?: string
    mediaType?: string
    prompt?: string
}

interface GalleryPickerFieldProps {
    value: GalleryPickerValue
    onSelect: (patch: Record<string, unknown>) => void
}

export default function GalleryPickerField({ value, onSelect }: GalleryPickerFieldProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [items, setItems] = useState<Generation[]>([])
    const [isLoading, setIsLoading] = useState(false)

    useEffect(() => {
        if (!isOpen) return
        let cancelled = false

        const load = async () => {
            setIsLoading(true)
            try {
                const list = await apiGetGenerations({ limit: 60 })
                if (!cancelled) setItems(list)
            } catch (err) {
                console.error('Failed to load gallery:', err)
            } finally {
                if (!cancelled) setIsLoading(false)
            }
        }
        load()
        return () => {
            cancelled = true
        }
    }, [isOpen])

    const handlePick = (item: Generation) => {
        onSelect({
            generationId: item.id,
            url: getStoragePublicUrl('generations', item.storage_path),
            mediaType: item.media_type,
            prompt: item.prompt ?? '',
            avatarId: item.avatar_id ?? null,
        })
        setIsOpen(false)
    }

    return (
        <>
            <div>
                <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide">Gallery item</span>
                <button
                    type="button"
                    onClick={() => setIsOpen(true)}
                    className="mt-0.5 w-full flex items-center gap-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded px-2 py-2 hover:border-primary transition-colors"
                >
                    {value.url && value.mediaType !== 'VIDEO' ? (
                        <img
                            src={value.url}
                            alt=""
                            className="w-8 h-8 rounded object-cover"
                        />
                    ) : (
                        <div className="w-8 h-8 rounded bg-gray-200 dark:bg-gray-800 flex items-center justify-center">
                            {value.mediaType === 'VIDEO' ? (
                                <HiOutlineFilm className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                            ) : (
                                <HiOutlineCollection className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                            )}
                        </div>
                    )}
                    <div className="flex-1 text-left min-w-0">
                        <div className="text-xs text-gray-900 dark:text-gray-100 truncate">
                            {value.generationId
                                ? (value.prompt || 'Gallery item')
                                : 'Select from gallery…'}
                        </div>
                        {value.generationId && (
                            <div className="text-[10px] text-gray-400 dark:text-gray-500 font-mono truncate">
                                {value.mediaType} · {String(value.generationId).slice(0, 8)}
                            </div>
                        )}
                    </div>
                </button>
            </div>

            <Dialog
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                onRequestClose={() => setIsOpen(false)}
                width={720}
            >
                <div className="p-2">
                    <h4 className="text-lg font-semibold mb-4">Select from Gallery</h4>
                    {isLoading ? (
                        <div className="flex justify-center py-12">
                            <Spinner size={40} />
                        </div>
                    ) : items.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                            No saved generations yet. Create some in Avatar Studio first.
                        </div>
                    ) : (
                        <div className="grid grid-cols-4 gap-3 max-h-[60vh] overflow-y-auto">
                            {items.map((item) => {
                                const url = getStoragePublicUrl('generations', item.storage_path)
                                const isSelected = value.generationId === item.id
                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => handlePick(item)}
                                        className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                                            isSelected
                                                ? 'border-primary'
                                                : 'border-transparent hover:border-gray-300'
                                        }`}
                                    >
                                        {item.media_type === 'VIDEO' ? (
                                            <video
                                                src={url}
                                                muted
                                                playsInline
                                                className="w-full aspect-square object-cover bg-black"
                                            />
                                        ) : (
                                            <img
                                                src={url}
                                                alt=""
                                                loading="lazy"
                                                className="w-full aspect-square object-cover"
                                            />
                                        )}
                                        {item.media_type === 'VIDEO' && (
                                            <div className="absolute top-1 left-1 bg-black/60 rounded p-0.5">
                                                <HiOutlineFilm className="w-3 h-3 text-white" />
                                            </div>
                                        )}
                                        {isSelected && (
                                            <div className="absolute top-1 right-1 bg-primary rounded-full p-0.5">
                                                <HiOutlineCheck className="w-3 h-3 text-white" />
                                            </div>
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                    )}
                </div>
            </Dialog>
        </>
    )
}
