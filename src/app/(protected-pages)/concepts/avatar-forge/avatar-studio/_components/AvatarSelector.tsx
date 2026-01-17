'use client'

import { useState, useEffect } from 'react'
import { useAvatarStudioStore } from '../_store/avatarStudioStore'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Spinner from '@/components/ui/Spinner'
import ScrollBar from '@/components/ui/ScrollBar'
import { HiOutlineUser, HiOutlineCheck, HiOutlinePlus } from 'react-icons/hi'
import { apiGetAvatars, apiGetAvatarReferences } from '@/services/AvatarForgeService'
import { supabase } from '@/lib/supabase'
import { createThumbnail } from '@/utils/imageOptimization'
import type { Avatar, AvatarReference } from '@/@types/supabase'
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
        clearAvatarReferences,
    } = useAvatarStudioStore()

    // Helper to download and create thumbnail
    const createAvatarThumbnail = async (storagePath: string): Promise<string | null> => {
        try {
            const { data, error } = await supabase.storage
                .from('avatars')
                .download(storagePath)

            if (error || !data) return null

            // Convert blob to base64
            const base64 = await new Promise<string>((resolve) => {
                const reader = new FileReader()
                reader.onloadend = () => {
                    const result = reader.result as string
                    resolve(result.split(',')[1] || '')
                }
                reader.onerror = () => resolve('')
                reader.readAsDataURL(data)
            })

            if (!base64) return null

            // Create optimized thumbnail (200x200)
            return await createThumbnail(base64, 'THUMBNAIL')
        } catch {
            return null
        }
    }

    const loadAvatars = async () => {
        setIsLoading(true)
        try {
            const data = await apiGetAvatars(userId)

            // Get thumbnails for each avatar (download and create actual thumbnails)
            const avatarsWithThumbnails = await Promise.all(
                data.map(async (avatar) => {
                    try {
                        const refs = await apiGetAvatarReferences(avatar.id)
                        const faceRef = refs.find(r => r.type === 'face')
                        const firstRef = refs[0]
                        const thumbnailRef = faceRef || firstRef

                        // Download and create actual thumbnail
                        const thumbnailUrl = thumbnailRef
                            ? await createAvatarThumbnail(thumbnailRef.storage_path)
                            : null

                        return {
                            ...avatar,
                            avatar_references: refs,
                            thumbnailUrl,
                        }
                    } catch {
                        return { ...avatar, avatar_references: [], thumbnailUrl: null }
                    }
                })
            )

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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, userId])

    // Helper to download and convert to base64 with thumbnail
    const downloadReferenceWithThumbnail = async (storagePath: string): Promise<{ base64: string; url: string; thumbnailUrl: string }> => {
        try {
            const { data, error } = await supabase.storage
                .from('avatars')
                .download(storagePath)

            if (error || !data) {
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

            onClose()
        } catch (error) {
            console.error('Failed to load avatar references:', error)
        }
    }

    const handleGoToCreator = () => {
        onClose()
        router.push('/concepts/avatar-forge/avatar-creator')
    }

    return (
        <Dialog
            isOpen={isOpen}
            onClose={onClose}
            width={700}
        >
            <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <HiOutlineUser className="w-6 h-6 text-primary" />
                        <div>
                            <h2 className="text-lg font-bold">Select Avatar</h2>
                            <p className="text-xs text-gray-500">Choose an avatar to use in the studio</p>
                        </div>
                    </div>
                    <Button
                        size="sm"
                        variant="solid"
                        icon={<HiOutlinePlus />}
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
                        <div className="grid grid-cols-3 gap-4">
                            {avatars.map((avatar) => (
                                <Card
                                    key={avatar.id}
                                    className={`relative cursor-pointer transition-all hover:shadow-lg ${
                                        currentAvatarId === avatar.id
                                            ? 'ring-2 ring-primary'
                                            : selectedAvatarId === avatar.id
                                            ? 'ring-2 ring-green-500'
                                            : ''
                                    }`}
                                    onClick={() => handleSelectAvatar(avatar)}
                                >
                                    {/* Thumbnail */}
                                    <div className="aspect-square bg-gray-100 dark:bg-gray-800 rounded-t-lg overflow-hidden">
                                        {avatar.thumbnailUrl ? (
                                            <img
                                                src={avatar.thumbnailUrl}
                                                alt={avatar.name}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <HiOutlineUser className="w-12 h-12 text-gray-400" />
                                            </div>
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div className="p-3">
                                        <p className="font-medium text-sm truncate">{avatar.name}</p>
                                        <p className="text-xs text-gray-500">
                                            {avatar.avatar_references?.length || 0} references
                                        </p>
                                    </div>

                                    {/* Selection indicator */}
                                    {currentAvatarId === avatar.id && (
                                        <div className="absolute top-2 right-2 w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center">
                                            <HiOutlineCheck className="w-4 h-4" />
                                        </div>
                                    )}
                                </Card>
                            ))}
                        </div>
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
