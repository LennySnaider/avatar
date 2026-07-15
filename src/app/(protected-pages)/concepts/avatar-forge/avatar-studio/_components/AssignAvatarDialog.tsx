'use client'

/**
 * Shared "Assign to avatar" dialog — used from the gallery cards and the
 * image preview modal. The owner (generations.avatar_id) decides which
 * avatar's social accounts can publish the media. The store's
 * updateGalleryItem also syncs previewMedia, so both surfaces stay fresh.
 */
import { useEffect, useState } from 'react'
import Dialog from '@/components/ui/Dialog'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { useAvatarStudioStore } from '../_store/avatarStudioStore'
import { apiGetAvatars, apiSetGenerationAvatar } from '@/services/AvatarForgeService'
import type { GeneratedMedia } from '../types'

interface AvatarOption {
    value: string
    label: string
}

const NO_AVATAR_OPTION: AvatarOption = { value: '', label: 'No avatar (generic)' }

interface AssignAvatarDialogProps {
    media: GeneratedMedia | null
    userId?: string
    onClose: () => void
}

const AssignAvatarDialog = ({ media, userId, onClose }: AssignAvatarDialogProps) => {
    const updateGalleryItem = useAvatarStudioStore((s) => s.updateGalleryItem)
    const [options, setOptions] = useState<AvatarOption[] | null>(null)
    const [selected, setSelected] = useState<string>('')
    const [isAssigning, setIsAssigning] = useState(false)

    useEffect(() => {
        if (!media) return
        setSelected(media.avatarId ?? '')
        if (options === null && userId) {
            apiGetAvatars()
                .then((avatars) =>
                    setOptions(avatars.map((a) => ({ value: a.id, label: a.name }))),
                )
                .catch(() => setOptions([]))
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [media, userId])

    const handleAssign = async () => {
        if (!media?.generationId) return
        setIsAssigning(true)
        try {
            const nextAvatarId = selected || null
            await apiSetGenerationAvatar(media.generationId, nextAvatarId)
            const nextName = options?.find((o) => o.value === nextAvatarId)?.label
            updateGalleryItem(media.id, {
                avatarId: nextAvatarId,
                avatarInfo: nextName ? { name: nextName } : undefined,
            })
            toast.push(
                <Notification type="success" title="Avatar assigned">
                    {nextName
                        ? `This media now belongs to ${nextName}`
                        : 'This media is now generic (no avatar)'}
                </Notification>,
            )
            onClose()
        } catch (error) {
            toast.push(
                <Notification type="danger" title="Failed to assign avatar">
                    {error instanceof Error ? error.message : 'Unknown error'}
                </Notification>,
            )
        } finally {
            setIsAssigning(false)
        }
    }

    return (
        <Dialog isOpen={!!media} onClose={onClose} onRequestClose={onClose} width={420}>
            <h5 className="mb-1">Assign to avatar</h5>
            <p className="text-sm text-gray-500 mb-4">
                The owner decides which avatar&apos;s social accounts can publish this media.
            </p>
            {options === null ? (
                <p className="text-sm text-gray-500">Loading avatars…</p>
            ) : (
                <Select<AvatarOption>
                    instanceId="assign-avatar"
                    options={[NO_AVATAR_OPTION, ...options]}
                    value={
                        [NO_AVATAR_OPTION, ...options].find((o) => o.value === selected) ??
                        NO_AVATAR_OPTION
                    }
                    isSearchable={options.length > 6}
                    onChange={(opt) => setSelected(opt?.value ?? '')}
                />
            )}
            <div className="flex items-center justify-end gap-2 mt-4">
                <Button variant="plain" disabled={isAssigning} onClick={onClose}>
                    Cancel
                </Button>
                <Button
                    variant="solid"
                    loading={isAssigning}
                    disabled={options === null}
                    onClick={handleAssign}
                >
                    Assign
                </Button>
            </div>
        </Dialog>
    )
}

export default AssignAvatarDialog
