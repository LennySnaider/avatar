'use client'

import { useState, useEffect, useRef } from 'react'
import { useAvatarStudioStore } from '../_store/avatarStudioStore'
import Dialog from '@/components/ui/Dialog'
import AvatarGridPicker from '../../_shared/AvatarGridPicker'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import ScrollBar from '@/components/ui/ScrollBar'
import { HiOutlineUser, HiOutlinePlus } from 'react-icons/hi'
import { apiGetAvatars, apiGetAvatarReferences, getSignedUrl } from '@/services/AvatarForgeService'
import { getStoragePublicUrl } from '@/lib/supabase'
import { createThumbnail } from '@/utils/imageOptimization'
import type { Avatar, AvatarReference } from '@/@types/supabase'
import type { ClonedVoice } from '@/@types/voice'
import type { ReferenceImage, PhysicalMeasurements } from '../types'
import { useRouter } from 'next/navigation'

interface AvatarWithRefs extends Avatar {
    avatar_references?: AvatarReference[]
    thumbnailUrl?: string | null
}

interface AvatarSelectorProps {
    userId: string
    isOpen: boolean
    onClose: () => void
}

const AvatarSelector = ({ userId, isOpen, onClose }: AvatarSelectorProps) => {
    const router = useRouter()
    const [avatars, setAvatars] = useState<AvatarWithRefs[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [selectedAvatarId, setSelectedAvatarId] = useState<string | null>(null)
    // Tracks the most recent selection synchronously so late async results
    // (e.g. a slow voice fetch for a previously clicked avatar) are dropped.
    const latestSelectionRef = useRef<string | null>(null)

    const {
        avatarId: currentAvatarId,
        setAvatarId,
        setAvatarName,
        addGeneralReference,
        setFaceRef,
        setAngleRef,
        setBodyRef,
        setIdentityWeight,
        setMeasurements,
        setFaceDescription,
        setAvatarDefaultVoice,
        clearAvatarReferences,
    } = useAvatarStudioStore()

    const loadAvatars = async () => {
        setIsLoading(true)
        try {
            // ONE round trip: apiGetAvatars already joins avatar_references(*).
            // The old flow re-queried references PER avatar and then DOWNLOADED
            // each full-res image to build a canvas thumbnail before showing
            // anything — the modal sat on a spinner for seconds. The `avatars`
            // bucket is public, so the card <img> can point straight at the
            // public URL (browser scales + caches it).
            const data = await apiGetAvatars()
            const avatarsWithThumbnails = data.map((avatar) => {
                const refs = avatar.avatar_references ?? []
                const thumbnailRef =
                    refs.find((r) => r.type === 'face') || refs[0]
                return {
                    ...avatar,
                    avatar_references: refs,
                    thumbnailUrl: thumbnailRef
                        ? getStoragePublicUrl('avatars', thumbnailRef.storage_path)
                        : null,
                }
            })
            setAvatars(avatarsWithThumbnails)
        } catch (error) {
            console.error('Failed to load avatars:', error)
        } finally {
            setIsLoading(false)
        }
    }

    // Load avatars when dialog opens
    useEffect(() => {
        if (isOpen && userId) {
            loadAvatars()
        }
         
    }, [isOpen, userId])

    // Helper to download and convert to base64 with thumbnail. Goes through a
    // server-signed URL (ownership enforced server-side) instead of the
    // browser's anon Supabase client.
    const downloadReferenceWithThumbnail = async (storagePath: string): Promise<{ base64: string; url: string; thumbnailUrl: string }> => {
        try {
            const signedUrl = await getSignedUrl('avatars', storagePath)
            const res = await fetch(signedUrl)
            const data = res.ok ? await res.blob() : null

            if (!data) {
                return { base64: '', url: '', thumbnailUrl: '' }
            }

            // Convert blob to base64
            const result = await new Promise<string>((resolve) => {
                const reader = new FileReader()
                reader.onloadend = () => resolve(reader.result as string)
                reader.onerror = () => resolve('')
                reader.readAsDataURL(data)
            })

            const base64 = result.split(',')[1] || ''
            let thumbnailUrl = result

            // Create optimized thumbnail
            if (base64) {
                try {
                    thumbnailUrl = await createThumbnail(base64, 'THUMBNAIL')
                } catch {
                    // Fallback to full URL
                }
            }

            return { base64, url: result, thumbnailUrl }
        } catch {
            return { base64: '', url: '', thumbnailUrl: '' }
        }
    }

    const handleSelectAvatar = async (avatar: AvatarWithRefs) => {
        setSelectedAvatarId(avatar.id)
        latestSelectionRef.current = avatar.id

        // Clear the previous avatar's voice immediately so a later TTS call
        // never picks up a stale voice while the new one is being resolved.
        setAvatarDefaultVoice(null)

        try {
            // Clear only avatar references (keep session tools like assets, clone, pose, etc.)
            clearAvatarReferences()

            // Load references
            const refs = avatar.avatar_references || await apiGetAvatarReferences(avatar.id)

            // Convert to ReferenceImage format with thumbnails and set in store
            for (const ref of refs) {
                const { base64, url, thumbnailUrl } = await downloadReferenceWithThumbnail(ref.storage_path)
                const refImage: ReferenceImage = {
                    id: ref.id,
                    url,
                    mimeType: ref.mime_type,
                    base64,
                    type: ref.type as 'general' | 'face' | 'angle' | 'body',
                    storagePath: ref.storage_path,
                    thumbnailUrl,
                }

                switch (ref.type) {
                    case 'general':
                        addGeneralReference(refImage)
                        break
                    case 'face':
                        setFaceRef(refImage)
                        break
                    case 'angle':
                        setAngleRef(refImage)
                        break
                    case 'body':
                        setBodyRef(refImage)
                        break
                }
            }

            // Set avatar metadata
            setAvatarId(avatar.id)
            setAvatarName(avatar.name)
            setIdentityWeight(avatar.identity_weight || 85)
            setFaceDescription(avatar.face_description || '')
            if (avatar.measurements) {
                setMeasurements(avatar.measurements as PhysicalMeasurements)
            }

            // Resolve the new avatar's default voice (if any) for TTS/lip-sync.
            if (avatar.default_voice_id) {
                try {
                    const res = await fetch('/api/voice/list')
                    // Drop the response if the user switched avatars while the
                    // fetch was in flight — a late result for a no-longer-selected
                    // avatar must not clobber the current avatar's voice.
                    const isStale =
                        latestSelectionRef.current !== avatar.id ||
                        useAvatarStudioStore.getState().avatarId !== avatar.id
                    if (!isStale && res.ok) {
                        const { voices } = (await res.json()) as { voices: ClonedVoice[] }
                        const defaultVoice = voices.find((v) => v.id === avatar.default_voice_id)
                        if (defaultVoice) {
                            setAvatarDefaultVoice(defaultVoice)
                        }
                    }
                } catch (voiceError) {
                    console.error('Failed to load avatar default voice:', voiceError)
                }
            }

            onClose()
        } catch (error) {
            console.error('Failed to load avatar references:', error)
        }
    }

    const handleGoToCreator = () => {
        onClose()
        router.push('/concepts/avatar-forge/avatar-studio')
    }

    return (
        <Dialog
            isOpen={isOpen}
            onClose={onClose}
            width={700}
        >
            <div className="p-4 sm:p-6">
                <div className="flex items-center justify-between gap-3 mb-4 sm:mb-6">
                    <div className="flex items-center gap-3 min-w-0">
                        <HiOutlineUser className="w-6 h-6 text-primary shrink-0" />
                        <div className="min-w-0">
                            <h2 className="text-lg font-bold whitespace-nowrap">Select Avatar</h2>
                            <p className="text-xs text-gray-500 hidden sm:block">Choose an avatar to use in the studio</p>
                        </div>
                    </div>
                    <Button
                        size="sm"
                        variant="solid"
                        icon={<HiOutlinePlus />}
                        className="shrink-0"
                        onClick={handleGoToCreator}
                    >
                        Create New
                    </Button>
                </div>

                {isLoading ? (
                    <div className="flex items-center justify-center h-64">
                        <Spinner size={32} />
                    </div>
                ) : avatars.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                        <HiOutlineUser className="w-16 h-16 mb-4" />
                        <p className="text-lg font-medium">No avatars yet</p>
                        <p className="text-sm mb-4">Create your first avatar to get started</p>
                        <Button
                            variant="solid"
                            icon={<HiOutlinePlus />}
                            onClick={handleGoToCreator}
                        >
                            Create Avatar
                        </Button>
                    </div>
                ) : (
                    <ScrollBar style={{ maxHeight: '400px' }}>
                        {/* Grid compartido estilo Flow Builder (DRY con
                            AvatarPickerField); Create New sigue en el header. */}
                        <AvatarGridPicker
                            items={avatars.map((a) => ({
                                id: a.id,
                                name: a.name,
                                thumbnailUrl: a.thumbnailUrl,
                                subtitle: `${a.avatar_references?.length || 0} refs`,
                            }))}
                            selectedId={selectedAvatarId}
                            currentId={currentAvatarId}
                            onPick={(item) => {
                                const avatar = avatars.find(
                                    (a) => a.id === item.id,
                                )
                                if (avatar) handleSelectAvatar(avatar)
                            }}
                        />
                    </ScrollBar>
                )}

                <div className="flex justify-end mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <Button variant="plain" onClick={onClose}>
                        Cancel
                    </Button>
                </div>
            </div>
        </Dialog>
    )
}

export default AvatarSelector
