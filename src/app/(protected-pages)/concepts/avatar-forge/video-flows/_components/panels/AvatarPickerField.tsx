'use client'

import { useEffect, useState } from 'react'
import Dialog from '@/components/ui/Dialog'
import Spinner from '@/components/ui/Spinner'
import { HiOutlineUser } from 'react-icons/hi'
import AvatarGridPicker from '../../../_shared/AvatarGridPicker'
import { apiGetAvatars, apiGetAvatarReferences, getSignedUrl } from '@/services/AvatarForgeService'
import type { Avatar, AvatarReference, PhysicalMeasurements } from '@/@types/supabase'

// Fetch a storage object through a server-signed URL (identity/ownership
// enforced server-side) instead of the browser's anon Supabase client.
async function downloadViaSignedUrl(bucket: string, path: string): Promise<Blob | null> {
    try {
        const url = await getSignedUrl(bucket, path)
        const res = await fetch(url)
        if (!res.ok) return null
        return await res.blob()
    } catch {
        return null
    }
}

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
                const list = await apiGetAvatars()
                const withThumbs = await Promise.all(
                    list.map(async (a) => {
                        const refs = a.avatar_references ?? []
                        const faceRef = refs.find((r) => r.type === 'face') ?? refs[0]
                        let thumbnailDataUrl: string | null = null
                        if (faceRef?.storage_path) {
                            const blob = await downloadViaSignedUrl('avatars', faceRef.storage_path)
                            if (blob) {
                                thumbnailDataUrl = await blobToDataUrl(blob)
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
                    const data = await downloadViaSignedUrl('avatars', ref.storage_path)
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
                <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide">Avatar</span>
                <button
                    type="button"
                    onClick={() => setIsOpen(true)}
                    className="mt-0.5 w-full flex items-center gap-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded px-2 py-2 hover:border-primary transition-colors"
                >
                    {value.thumbnailUrl ? (
                         
                        <img
                            src={value.thumbnailUrl}
                            alt=""
                            className="w-8 h-8 rounded object-cover"
                        />
                    ) : (
                        <div className="w-8 h-8 rounded bg-gray-200 dark:bg-gray-800 flex items-center justify-center">
                            <HiOutlineUser className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                        </div>
                    )}
                    <div className="flex-1 text-left">
                        <div className="text-xs text-gray-900 dark:text-gray-100">
                            {value.avatarName ?? 'Select avatar…'}
                        </div>
                        {value.avatarId && (
                            <div className="text-[10px] text-gray-400 dark:text-gray-500 font-mono truncate">
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
                        <div className="max-h-[60vh] overflow-y-auto">
                            {/* Grid compartido (misma UI que el AvatarSelector
                                del Studio — DRY en _shared/AvatarGridPicker). */}
                            <AvatarGridPicker
                                items={avatars.map((a) => ({
                                    id: a.id,
                                    name: a.name,
                                    thumbnailUrl: a.thumbnailDataUrl,
                                }))}
                                selectedId={value.avatarId}
                                disabled={isLoadingRefs}
                                gridClassName="grid grid-cols-3 gap-3"
                                onPick={(item) => {
                                    const avatar = avatars.find(
                                        (a) => a.id === item.id,
                                    )
                                    if (avatar) handlePick(avatar)
                                }}
                            />
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
