'use client'

/**
 * Shared "Assign to avatar" dialog — used from the gallery cards and the
 * image preview modal. The owner (generations.avatar_id) decides which
 * avatar's social accounts can publish the media. The store's
 * updateGalleryItem also syncs previewMedia, so both surfaces stay fresh.
 * Usa el grid de fotos compartido (AvatarGridPicker) — misma UI que el
 * selector del Studio y el del Flow Builder (DRY).
 */
import { useEffect, useState } from 'react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { useAvatarStudioStore } from '../_store/avatarStudioStore'
import { apiGetAvatars, apiSetGenerationAvatar } from '@/services/AvatarForgeService'
import { getStoragePublicUrl } from '@/lib/supabase'
import AvatarGridPicker, { type AvatarGridItem } from '../../_shared/AvatarGridPicker'
import type { GeneratedMedia } from '../types'

/** id '' = sin avatar (genérico) — card con placeholder en el grid. */
const NO_AVATAR_ITEM: AvatarGridItem = { id: '', name: 'No avatar (generic)' }

interface AssignAvatarDialogProps {
    media: GeneratedMedia | null
    userId?: string
    onClose: () => void
}

const AssignAvatarDialog = ({ media, userId, onClose }: AssignAvatarDialogProps) => {
    const updateGalleryItem = useAvatarStudioStore((s) => s.updateGalleryItem)
    const [avatarItems, setAvatarItems] = useState<AvatarGridItem[] | null>(null)
    const [selected, setSelected] = useState<string>('')
    const [isAssigning, setIsAssigning] = useState(false)

    useEffect(() => {
        if (!media) return
        setSelected(media.avatarId ?? '')
        if (avatarItems === null && userId) {
            apiGetAvatars()
                .then((avatars) =>
                    setAvatarItems(
                        avatars.map((a) => {
                            const refs = a.avatar_references ?? []
                            const thumbRef =
                                refs.find((r) => r.type === 'face') || refs[0]
                            return {
                                id: a.id,
                                name: a.name,
                                thumbnailUrl: thumbRef
                                    ? getStoragePublicUrl(
                                          'avatars',
                                          thumbRef.storage_path,
                                      )
                                    : null,
                            }
                        }),
                    ),
                )
                .catch(() => setAvatarItems([]))
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [media, userId])

    const handleAssign = async () => {
        if (!media?.generationId) return
        setIsAssigning(true)
        try {
            const nextAvatarId = selected || null
            await apiSetGenerationAvatar(media.generationId, nextAvatarId)
            const nextName = avatarItems?.find((o) => o.id === nextAvatarId)?.name
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
        <Dialog isOpen={!!media} onClose={onClose} onRequestClose={onClose} width={560}>
            <h5 className="mb-1">Assign to avatar</h5>
            <p className="text-sm text-gray-500 mb-4">
                The owner decides which avatar&apos;s social accounts can publish this media.
            </p>
            {avatarItems === null ? (
                <p className="text-sm text-gray-500">Loading avatars…</p>
            ) : (
                <div className="max-h-[50vh] overflow-y-auto thin-scrollbar pr-1">
                    <AvatarGridPicker
                        items={[NO_AVATAR_ITEM, ...avatarItems]}
                        selectedId={selected}
                        onPick={(item) => setSelected(item.id)}
                    />
                </div>
            )}
            <div className="flex items-center justify-end gap-2 mt-4">
                <Button variant="plain" disabled={isAssigning} onClick={onClose}>
                    Cancel
                </Button>
                <Button
                    variant="solid"
                    loading={isAssigning}
                    disabled={avatarItems === null}
                    onClick={handleAssign}
                >
                    Assign
                </Button>
            </div>
        </Dialog>
    )
}

export default AssignAvatarDialog
