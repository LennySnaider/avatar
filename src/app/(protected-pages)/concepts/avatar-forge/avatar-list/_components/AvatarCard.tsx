'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Card from '@/components/ui/Card'
import Avatar from '@/components/ui/Avatar'
import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import Tag from '@/components/ui/Tag'
import Dropdown from '@/components/ui/Dropdown'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Spinner from '@/components/ui/Spinner'
import { AvatarEditDrawer, type AvatarEditData, type AvatarReferenceImage } from '@/components/shared/AvatarEditDrawer'
import { useAvatarListStore } from '../_store/avatarListStore'
import { apiDeleteAvatar, apiUpdateAvatar, apiUploadReference, apiDeleteAvatarReference } from '@/services/AvatarForgeService'
import { supabase } from '@/lib/supabase'
import { createThumbnail } from '@/utils/imageOptimization'
import type { AvatarWithReferences } from '../types'
import type { PhysicalMeasurements } from '@/@types/supabase'
import {
    HiOutlinePencil,
    HiOutlineTrash,
    HiOutlineDotsVertical,
    HiOutlinePhotograph,
} from 'react-icons/hi'

interface AvatarCardProps {
    avatar: AvatarWithReferences
}

const AvatarCard = ({ avatar }: AvatarCardProps) => {
    const router = useRouter()
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)
    const [isLoadingThumbnail, setIsLoadingThumbnail] = useState(true)

    // Edit drawer state
    const [editDrawerOpen, setEditDrawerOpen] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [initialEditData, setInitialEditData] = useState<AvatarEditData | null>(null)
    const [originalRefIds, setOriginalRefIds] = useState<string[]>([])

    const { selectedAvatars, toggleSelectAvatar, deleteAvatar, updateAvatar } =
        useAvatarListStore()

    const isSelected = selectedAvatars.some((a) => a.id === avatar.id)

    // Get first reference image for preview
    const previewImage = avatar.avatar_references?.find(
        (ref) => ref.type === 'face' || ref.type === 'general'
    )

    // Load thumbnail on mount
    useEffect(() => {
        const loadThumbnail = async () => {
            if (!previewImage?.storage_path) {
                setIsLoadingThumbnail(false)
                return
            }

            try {
                const { data, error } = await supabase.storage
                    .from('avatars')
                    .download(previewImage.storage_path)

                if (error || !data) {
                    setIsLoadingThumbnail(false)
                    return
                }

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

                if (base64) {
                    const thumb = await createThumbnail(base64, 'THUMBNAIL')
                    setThumbnailUrl(thumb)
                }
            } catch (err) {
                console.error('Failed to load thumbnail:', err)
            } finally {
                setIsLoadingThumbnail(false)
            }
        }

        loadThumbnail()
    }, [previewImage?.storage_path])

    // Load references when drawer opens and build initialEditData
    const loadReferences = useCallback(async () => {
        const generalRefs: AvatarReferenceImage[] = []
        let faceRef: AvatarReferenceImage | null = null
        let angleRef: AvatarReferenceImage | null = null
        let bodyRef: AvatarReferenceImage | null = null
        const refIds: string[] = []

        if (avatar.avatar_references?.length) {
            for (const ref of avatar.avatar_references) {
                if (!ref.storage_path) continue

                try {
                    const { data, error } = await supabase.storage
                        .from('avatars')
                        .download(ref.storage_path)

                    if (error || !data) continue

                    const base64 = await new Promise<string>((resolve) => {
                        const reader = new FileReader()
                        reader.onloadend = () => {
                            const result = reader.result as string
                            resolve(result.split(',')[1] || '')
                        }
                        reader.onerror = () => resolve('')
                        reader.readAsDataURL(data)
                    })

                    if (base64) {
                        const thumb = await createThumbnail(base64, 'THUMBNAIL')
                        const refImage: AvatarReferenceImage = {
                            id: ref.id,
                            url: `data:${ref.mime_type};base64,${base64}`,
                            mimeType: ref.mime_type,
                            base64,
                            type: ref.type as 'general' | 'face' | 'angle' | 'body',
                            storagePath: ref.storage_path,
                            thumbnailUrl: thumb,
                        }
                        refIds.push(ref.id)

                        switch (ref.type) {
                            case 'face':
                                faceRef = refImage
                                break
                            case 'angle':
                                angleRef = refImage
                                break
                            case 'body':
                                bodyRef = refImage
                                break
                            default:
                                generalRefs.push(refImage)
                        }
                    }
                } catch (err) {
                    console.error('Failed to load reference:', err)
                }
            }
        }

        setOriginalRefIds(refIds)
        setInitialEditData({
            name: avatar.name,
            generalReferences: generalRefs,
            faceRef,
            angleRef,
            bodyRef,
            identityWeight: avatar.identity_weight || 85,
            measurements: (avatar.measurements as PhysicalMeasurements) || {
                age: 25,
                height: 165,
                bodyType: 'average',
                bust: 90,
                waist: 60,
                hips: 90,
            },
            faceDescription: avatar.face_description || '',
        })
    }, [avatar])

    const handleEdit = () => {
        setEditDrawerOpen(true)
        setInitialEditData(null) // Reset before loading
        loadReferences()
    }

    // Save handler for the shared drawer component
    const handleSaveFromDrawer = async (name: string, data: AvatarEditData) => {
        setIsSaving(true)
        try {
            // Collect all current ref IDs from the data
            const currentRefIds: string[] = []
            data.generalReferences.forEach(r => {
                if (r.storagePath) currentRefIds.push(r.id)
            })
            if (data.faceRef?.storagePath) currentRefIds.push(data.faceRef.id)
            if (data.angleRef?.storagePath) currentRefIds.push(data.angleRef.id)
            if (data.bodyRef?.storagePath) currentRefIds.push(data.bodyRef.id)

            // Delete references that were removed
            const refsToDelete = originalRefIds.filter(id => !currentRefIds.includes(id))
            for (const refId of refsToDelete) {
                try {
                    await apiDeleteAvatarReference(refId)
                } catch (err) {
                    console.error('Failed to delete reference:', err)
                }
            }

            // Upload new references (ones without storagePath)
            const allNewRefs = [
                ...data.generalReferences.filter(r => !r.storagePath),
                ...(data.faceRef && !data.faceRef.storagePath ? [data.faceRef] : []),
                ...(data.angleRef && !data.angleRef.storagePath ? [data.angleRef] : []),
                ...(data.bodyRef && !data.bodyRef.storagePath ? [data.bodyRef] : []),
            ]

            for (const ref of allNewRefs) {
                try {
                    const byteString = atob(ref.base64)
                    const arrayBuffer = new ArrayBuffer(byteString.length)
                    const uint8Array = new Uint8Array(arrayBuffer)
                    for (let i = 0; i < byteString.length; i++) {
                        uint8Array[i] = byteString.charCodeAt(i)
                    }
                    const blob = new Blob([uint8Array], { type: ref.mimeType })
                    const file = new File([blob], `${ref.type}-${Date.now()}.jpg`, { type: ref.mimeType })

                    await apiUploadReference(avatar.id, avatar.user_id || '', file, ref.type)
                } catch (err) {
                    console.error('Failed to upload reference:', err)
                }
            }

            // Update avatar metadata
            await apiUpdateAvatar(avatar.id, {
                name: name,
                identity_weight: data.identityWeight,
                face_description: data.faceDescription,
                measurements: data.measurements,
            })

            // Update local store
            updateAvatar(avatar.id, {
                name: name,
                identity_weight: data.identityWeight,
                face_description: data.faceDescription,
                measurements: data.measurements,
            })

            toast.push(
                <Notification type="success" title="Saved">
                    Avatar updated successfully
                </Notification>
            )
            setEditDrawerOpen(false)
        } catch (error) {
            console.error('Failed to save:', error)
            toast.push(
                <Notification type="danger" title="Error">
                    Failed to save changes
                </Notification>
            )
        } finally {
            setIsSaving(false)
        }
    }

    const handleDelete = async () => {
        setIsDeleting(true)
        try {
            await apiDeleteAvatar(avatar.id)
            deleteAvatar(avatar.id)
            setDeleteConfirmOpen(false)
        } catch (error) {
            console.error('Failed to delete avatar:', error)
        } finally {
            setIsDeleting(false)
        }
    }

    const handleGenerate = () => {
        router.push(`/concepts/avatar-forge/avatar-studio/${avatar.id}`)
    }

    return (
        <>
            <Card className="group relative overflow-hidden">
                <div className="absolute top-3 left-3 z-10">
                    <Checkbox
                        checked={isSelected}
                        onChange={() => toggleSelectAvatar(avatar)}
                    />
                </div>

                <div className="absolute top-3 right-3 z-10">
                    <Dropdown
                        placement="bottom-end"
                        renderTitle={
                            <Button
                                size="xs"
                                variant="plain"
                                icon={<HiOutlineDotsVertical />}
                            />
                        }
                    >
                        <Dropdown.Item
                            eventKey="edit"
                            onClick={handleEdit}
                        >
                            <span className="flex items-center gap-2">
                                <HiOutlinePencil />
                                Edit
                            </span>
                        </Dropdown.Item>
                        <Dropdown.Item
                            eventKey="generate"
                            onClick={handleGenerate}
                        >
                            <span className="flex items-center gap-2">
                                <HiOutlinePhotograph />
                                Generate
                            </span>
                        </Dropdown.Item>
                        <Dropdown.Item
                            eventKey="delete"
                            onClick={() => setDeleteConfirmOpen(true)}
                        >
                            <span className="flex items-center gap-2 text-red-500">
                                <HiOutlineTrash />
                                Delete
                            </span>
                        </Dropdown.Item>
                    </Dropdown>
                </div>

                <div
                    className="aspect-square bg-gray-100 dark:bg-gray-700 flex items-center justify-center cursor-pointer"
                    onClick={handleGenerate}
                >
                    {isLoadingThumbnail ? (
                        <Spinner size={32} />
                    ) : thumbnailUrl ? (
                        <img
                            src={thumbnailUrl}
                            alt={avatar.name}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <Avatar
                            size={80}
                            className="bg-gray-200 dark:bg-gray-600"
                        >
                            {avatar.name.charAt(0).toUpperCase()}
                        </Avatar>
                    )}
                </div>

                <div className="p-4">
                    <h5 className="font-semibold mb-2 truncate">{avatar.name}</h5>

                    <div className="flex flex-wrap gap-1 mb-3">
                        {avatar.avatar_references?.length > 0 && (
                            <Tag className="text-xs">
                                {avatar.avatar_references.length} refs
                            </Tag>
                        )}
                        {avatar.identity_weight && (
                            <Tag className="text-xs">
                                {avatar.identity_weight}% identity
                            </Tag>
                        )}
                    </div>

                    {avatar.face_description && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                            {avatar.face_description}
                        </p>
                    )}

                    <div className="mt-4 flex gap-2">
                        <Button
                            size="sm"
                            variant="solid"
                            className="flex-1"
                            onClick={handleGenerate}
                        >
                            Generate
                        </Button>
                        <Button
                            size="sm"
                            variant="plain"
                            icon={<HiOutlinePencil />}
                            onClick={handleEdit}
                        />
                    </div>
                </div>
            </Card>

            <ConfirmDialog
                isOpen={deleteConfirmOpen}
                type="danger"
                title="Delete Avatar"
                onClose={() => setDeleteConfirmOpen(false)}
                onRequestClose={() => setDeleteConfirmOpen(false)}
                onCancel={() => setDeleteConfirmOpen(false)}
                onConfirm={handleDelete}
                confirmButtonProps={{ loading: isDeleting }}
            >
                <p>
                    Are you sure you want to delete &quot;{avatar.name}&quot;?
                    This action cannot be undone.
                </p>
            </ConfirmDialog>

            {/* Edit Drawer - Using shared component */}
            <AvatarEditDrawer
                isOpen={editDrawerOpen}
                onClose={() => setEditDrawerOpen(false)}
                title="Edit Avatar"
                avatarName={avatar.name}
                initialData={initialEditData || undefined}
                onSave={handleSaveFromDrawer}
                showSaveToDb={true}
                isSaving={isSaving}
            />
        </>
    )
}

export default AvatarCard
