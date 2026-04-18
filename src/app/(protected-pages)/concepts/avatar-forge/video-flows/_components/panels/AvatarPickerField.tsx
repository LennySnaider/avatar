'use client'

import { useEffect, useState } from 'react'
import Dialog from '@/components/ui/Dialog'
import Spinner from '@/components/ui/Spinner'
import { HiOutlineUser, HiOutlineCheck } from 'react-icons/hi'
import { apiGetAvatars, apiGetAvatarReferences } from '@/services/AvatarForgeService'
import { supabase } from '@/lib/supabase'
import type { Avatar, AvatarReference, PhysicalMeasurements } from '@/@types/supabase'

interface AvatarWithRefs extends Avatar {
    avatar_references?: AvatarReference[]
    thumbnailDataUrl?: string | null
}

interface AvatarPickerValue {
    avatarId: string | null
    avatarName?: string
    thumbnailUrl?: string
}

interface AvatarPickerFieldProps {
    value: AvatarPickerValue
    onSelect: (patch: Record<string, unknown>) => void
}

export default function AvatarPickerField({ value, onSelect }: AvatarPickerFieldProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [avatars, setAvatars] = useState<AvatarWithRefs[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [isLoadingRefs, setIsLoadingRefs] = useState(false)

    useEffect(() => {
        if (!isOpen) return
        let cancelled = false

        const load = async () => {
            setIsLoading(true)
            try {
                const { data: { user } } = await supabase.auth.getUser()
                if (!user) throw new Error('Not authenticated')

                const list = await apiGetAvatars(user.id)
                const withThumbs = await Promise.all(
                    list.map(async (a) => {
                        const refs = a.avatar_references ?? []
                        const faceRef = refs.find((r) => r.type === 'face') ?? refs[0]
                        let thumbnailDataUrl: string | null = null
                        if (faceRef?.storage_path) {
                            const { data } = await supabase.storage
                                .from('avatars')
                                .download(faceRef.storage_path)
                            if (data) {
                                thumbnailDataUrl = await blobToDataUrl(data)
                            }
                        }
                        return { ...a, thumbnailDataUrl }
                    })
                )
                if (!cancelled) setAvatars(withThumbs)
            } catch (err) {
                console.error('Failed to load avatars:', err)
            } finally {
                if (!cancelled) setIsLoading(false)
            }
        }
        load()
        return () => {
            cancelled = true
        }
    }, [isOpen])

    const handlePick = async (avatar: AvatarWithRefs) => {
        setIsLoadingRefs(true)
        try {
            const refs = avatar.avatar_references ?? (await apiGetAvatarReferences(avatar.id))
            const references = await Promise.all(
                refs.map(async (ref) => {
                    const { data } = await supabase.storage
                        .from('avatars')
                        .download(ref.storage_path)
                    const base64 = data ? await blobToBase64(data) : ''
                    return {
                        id: ref.id,
                        mimeType: ref.mime_type,
                        base64,
                        type: ref.type,
                    }
                })
            )
            const faceRef = references.find((r) => r.type === 'face') ?? null

            onSelect({
                avatarId: avatar.id,
                avatarName: avatar.name,
                thumbnailUrl: avatar.thumbnailDataUrl ?? undefined,
                references,
                faceRef,
                measurements: (avatar.measurements as PhysicalMeasurements | null) ?? {},
            })
            setIsOpen(false)
        } catch (err) {
            console.error('Failed to load avatar references:', err)
        } finally {
            setIsLoadingRefs(false)
        }
    }

    return (
        <>
            <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-wide">Avatar</span>
                <button
                    type="button"
                    onClick={() => setIsOpen(true)}
                    className="mt-0.5 w-full flex items-center gap-2 bg-slate-900 border border-slate-700 rounded px-2 py-2 hover:border-slate-500 transition-colors"
                >
                    {value.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={value.thumbnailUrl}
                            alt=""
                            className="w-8 h-8 rounded object-cover"
                        />
                    ) : (
                        <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center">
                            <HiOutlineUser className="w-4 h-4 text-slate-500" />
                        </div>
                    )}
                    <div className="flex-1 text-left">
                        <div className="text-xs text-slate-200">
                            {value.avatarName ?? 'Select avatar…'}
                        </div>
                        {value.avatarId && (
                            <div className="text-[10px] text-slate-500 font-mono truncate">
                                {value.avatarId.slice(0, 8)}
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
                    <h4 className="text-lg font-semibold mb-4">Select Avatar</h4>
                    {isLoading ? (
                        <div className="flex justify-center py-12">
                            <Spinner size={40} />
                        </div>
                    ) : avatars.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                            No avatars yet. Create one in Avatar Studio first.
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto">
                            {avatars.map((a) => (
                                <button
                                    key={a.id}
                                    type="button"
                                    onClick={() => handlePick(a)}
                                    disabled={isLoadingRefs}
                                    className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                                        value.avatarId === a.id
                                            ? 'border-emerald-500'
                                            : 'border-transparent hover:border-gray-300'
                                    } ${isLoadingRefs ? 'opacity-50 cursor-wait' : ''}`}
                                >
                                    {a.thumbnailDataUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={a.thumbnailDataUrl}
                                            alt={a.name}
                                            className="w-full aspect-square object-cover"
                                        />
                                    ) : (
                                        <div className="w-full aspect-square bg-gray-200 flex items-center justify-center">
                                            <HiOutlineUser className="w-10 h-10 text-gray-400" />
                                        </div>
                                    )}
                                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                                        <div className="text-white text-xs font-medium truncate">
                                            {a.name}
                                        </div>
                                    </div>
                                    {value.avatarId === a.id && (
                                        <div className="absolute top-1 right-1 bg-emerald-500 rounded-full p-0.5">
                                            <HiOutlineCheck className="w-3 h-3 text-white" />
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </Dialog>
        </>
    )
}

async function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.onerror = () => resolve('')
        reader.readAsDataURL(blob)
    })
}

async function blobToBase64(blob: Blob): Promise<string> {
    const url = await blobToDataUrl(blob)
    return url.split(',')[1] ?? ''
}
