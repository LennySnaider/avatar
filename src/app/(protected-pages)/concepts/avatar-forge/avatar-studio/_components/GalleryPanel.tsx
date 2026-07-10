'use client'

import { useRef, useState } from 'react'
import { useAvatarStudioStore } from '../_store/avatarStudioStore'
import { downloadMediaUrl } from '../../_utils/mediaDownload'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Spinner from '@/components/ui/Spinner'
import ScrollBar from '@/components/ui/ScrollBar'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { apiDeleteGeneration } from '@/services/AvatarForgeService'
import { HiOutlineTrash, HiOutlineDownload, HiOutlinePhotograph, HiOutlineUpload, HiOutlineSearch, HiOutlineShare, HiOutlineSave } from 'react-icons/hi'
import type { GeneratedMedia, AspectRatio, MediaType } from '../types'

interface GalleryPanelProps {
    onCreateVariant?: (media: GeneratedMedia) => void
    onSaveToGallery?: (media: GeneratedMedia) => Promise<void>
    onPost?: (media: GeneratedMedia) => void
    /** Called for each uploaded file after it lands in the gallery — the studio
     * wires this to persistGeneration so uploads get a DB row (enables Post). */
    onUploaded?: (media: GeneratedMedia) => void
}

const GalleryPanel = ({ onSaveToGallery, onPost, onUploaded }: GalleryPanelProps) => {
    const {
        gallery,
        isGenerating,
        setPreviewMedia,
        removeFromGallery,
        addToGallery,
    } = useAvatarStudioStore()

    const uploadInputRef = useRef<HTMLInputElement>(null)

    const [searchQuery, setSearchQuery] = useState('')
    const [mediaTypeFilter, setMediaTypeFilter] = useState<MediaType | 'ALL'>('ALL')
    const [avatarFilter, setAvatarFilter] = useState<string>('ALL')

    // Distinct avatar names present in the gallery (for the Avatar filter)
    const avatarNames = Array.from(
        new Set(gallery.map((m) => m.avatarInfo?.name).filter((n): n is string => Boolean(n))),
    )

    // Client-side filter — ports the search + media-type approach from
    // ../../gallery/_components/GenerationGallery.tsx.
    const filteredGallery = gallery.filter((media) => {
        const matchesSearch =
            !searchQuery ||
            media.prompt.toLowerCase().includes(searchQuery.toLowerCase())
        const matchesType =
            mediaTypeFilter === 'ALL' || media.mediaType === mediaTypeFilter
        const matchesAvatar =
            avatarFilter === 'ALL' || media.avatarInfo?.name === avatarFilter
        return matchesSearch && matchesType && matchesAvatar
    })

    const detectAspectRatio = (width: number, height: number): AspectRatio => {
        const ratio = width / height
        if (ratio > 1.5) return '16:9'
        if (ratio > 1.15) return '4:3'
        if (ratio < 0.67) return '9:16'
        if (ratio < 0.87) return '3:4'
        return '1:1'
    }

    const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (!files || files.length === 0) return

        Array.from(files).forEach((file) => {
            const isVideo = file.type.startsWith('video/')
            const isImage = file.type.startsWith('image/')

            if (!isVideo && !isImage) {
                toast.push(
                    <Notification type="warning" title="Invalid File">
                        Only video and image files are supported
                    </Notification>
                )
                return
            }

            const url = URL.createObjectURL(file)
            const id = `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

            if (isVideo) {
                const video = document.createElement('video')
                video.preload = 'metadata'
                video.onloadedmetadata = () => {
                    const item: GeneratedMedia = {
                        id,
                        url,
                        prompt: `Uploaded: ${file.name}`,
                        aspectRatio: detectAspectRatio(video.videoWidth, video.videoHeight),
                        timestamp: Date.now(),
                        mediaType: 'VIDEO',
                    }
                    addToGallery(item)
                    onUploaded?.(item)
                }
                video.src = url
            } else {
                const img = new Image()
                img.onload = () => {
                    const item: GeneratedMedia = {
                        id,
                        url,
                        prompt: `Uploaded: ${file.name}`,
                        aspectRatio: detectAspectRatio(img.naturalWidth, img.naturalHeight),
                        timestamp: Date.now(),
                        mediaType: 'IMAGE',
                    }
                    addToGallery(item)
                    onUploaded?.(item)
                }
                img.src = url
            }
        })

        toast.push(
            <Notification type="success" title="Upload Complete">
                {files.length} file(s) added to gallery
            </Notification>
        )

        // Reset input
        e.target.value = ''
    }

    const handleDownload = async (media: GeneratedMedia) => {
        await downloadMediaUrl(
            media.url,
            `avatar-${media.mediaType.toLowerCase()}-${Date.now()}`,
            media.mediaType === 'VIDEO',
        )
    }

    // Delete with a real ConfirmDialog (the old toast-based confirm sometimes
    // failed to dismiss). Deleting removes BOTH the in-memory item and the
    // persisted `generations` row — the gallery hydrates from the DB, so a
    // memory-only delete resurrected the item on reload.
    const [deleteTarget, setDeleteTarget] = useState<GeneratedMedia | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    const handleDeleteConfirmed = async () => {
        if (!deleteTarget) return
        setIsDeleting(true)
        try {
            if (deleteTarget.generationId) {
                await apiDeleteGeneration(deleteTarget.generationId)
            }
            removeFromGallery(deleteTarget.id)
            setDeleteTarget(null)
        } catch (err) {
            console.error('Failed to delete generation:', err)
            toast.push(
                <Notification type="danger" title="Delete failed">
                    The item could not be deleted from the database. Try again.
                </Notification>,
            )
        } finally {
            setIsDeleting(false)
        }
    }

    // Stitch/montage moved to the Video Editor as the "Combine" mode —
    // see src/app/.../video-editor/_components/VideoEditorMain.tsx.
    // The gallery no longer manages selection or processing state.

    return (
        <div className="h-full flex flex-col">
            {/* Hidden Upload Input */}
            <input
                ref={uploadInputRef}
                type="file"
                accept="video/*,image/*"
                multiple
                className="hidden"
                onChange={handleUpload}
            />

            {/* Fixed header: title + Upload + search/filters (outside the
                scroll area so Upload never disappears while browsing) */}
            <div className="px-4 pt-4 shrink-0">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-lg">Gallery</h3>
                    <Button
                        size="xs"
                        variant="plain"
                        onClick={() => uploadInputRef.current?.click()}
                        icon={<HiOutlineUpload />}
                    >
                        <span>Upload</span>
                    </Button>
                </div>

                {gallery.length > 0 && (
                    <div className="flex items-center gap-2 mb-3">
                        <Input
                            size="sm"
                            placeholder="Search by prompt..."
                            prefix={<HiOutlineSearch className="text-lg" />}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="flex-1"
                        />
                        {avatarNames.length > 0 && (
                            <select
                                value={avatarFilter}
                                onChange={(e) => setAvatarFilter(e.target.value)}
                                className="w-32 px-3 py-1.5 text-sm border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
                                title="Filter by avatar"
                            >
                                <option value="ALL">All avatars</option>
                                {avatarNames.map((name) => (
                                    <option key={name} value={name}>
                                        {name}
                                    </option>
                                ))}
                            </select>
                        )}
                        <select
                            value={mediaTypeFilter}
                            onChange={(e) => setMediaTypeFilter(e.target.value as MediaType | 'ALL')}
                            className="w-28 px-3 py-1.5 text-sm border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
                        >
                            <option value="ALL">All</option>
                            <option value="IMAGE">Images</option>
                            <option value="VIDEO">Videos</option>
                        </select>
                    </div>
                )}
            </div>

            <ScrollBar className="flex-1 h-full" autoHide={false}>
                <div className="p-4 pt-1">

                    {/* Empty State */}
                    {gallery.length === 0 && !isGenerating && (
                        <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                            <div className="w-16 h-16 rounded-full border-2 border-gray-300 flex items-center justify-center mb-4">
                                <HiOutlinePhotograph className="w-8 h-8" />
                            </div>
                            <p className="text-lg font-medium">Ready to Generate</p>
                            <p className="text-sm mb-4">Describe a scene and click Generate</p>
                            <Button
                                size="sm"
                                variant="solid"
                                onClick={() => uploadInputRef.current?.click()}
                                icon={<HiOutlineUpload />}
                            >
                                Or Upload Videos/Images
                            </Button>
                        </div>
                    )}

                    {/* No Matches State */}
                    {gallery.length > 0 && filteredGallery.length === 0 && !isGenerating && (
                        <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                            <HiOutlinePhotograph className="w-8 h-8 mb-2" />
                            <p className="text-sm">No media matches your filters</p>
                        </div>
                    )}

                    {/* Gallery Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {/* Generating Placeholder */}
                        {isGenerating && (
                            <Card className="h-64 flex items-center justify-center bg-gray-100 dark:bg-gray-800 animate-pulse">
                                <div className="flex flex-col items-center">
                                    <Spinner size={32} />
                                    <span className="text-xs text-primary mt-2 font-mono">Generating...</span>
                                </div>
                            </Card>
                        )}

                        {/* Gallery Items */}
                        {filteredGallery.map((media) => {
                            return (
                                <Card
                                    key={media.id}
                                    className="relative group overflow-hidden cursor-pointer transition-all hover:shadow-lg"
                                    onClick={() => setPreviewMedia(media)}
                                >
                                    {/* Media Content */}
                                    <div className="bg-gray-100 dark:bg-gray-800">
                                        {media.mediaType === 'VIDEO' ? (
                                            <video
                                                src={media.url}
                                                className="w-full h-auto"
                                                muted
                                                loop
                                                onMouseOver={(e) => {
                                                    e.currentTarget
                                                        .play()
                                                        .catch(() => {})
                                                }}
                                                onMouseOut={(e) => e.currentTarget.pause()}
                                            />
                                        ) : (
                                            <img
                                                src={media.url}
                                                alt={media.prompt}
                                                className="w-full h-auto"
                                            />
                                        )}
                                    </div>

                                    {/* Media Type + Save State badges (top-right column —
                                        the bottom corners belong to the action buttons) */}
                                    <div className="absolute top-2 right-2 z-10 flex flex-col items-end gap-1">
                                        <span
                                            className={`px-2 py-1 text-xs font-bold rounded ${
                                                media.mediaType === 'VIDEO'
                                                    ? 'bg-purple-500 text-white'
                                                    : 'bg-blue-500 text-white'
                                            }`}
                                        >
                                            {media.mediaType}
                                        </span>
                                        {media.saveState === 'saving' && (
                                            <span className="px-2 py-1 text-[10px] font-medium rounded bg-black/70 text-white inline-flex items-center gap-1">
                                                <Spinner size={12} />
                                                Saving
                                            </span>
                                        )}
                                        {media.saveState === 'saved' && (
                                            <span className="px-2 py-1 text-[10px] font-medium rounded bg-emerald-500 text-white inline-block">
                                                Saved
                                            </span>
                                        )}
                                        {media.saveState === 'error' && (
                                            <span className="px-2 py-1 text-[10px] font-medium rounded bg-red-500 text-white inline-block">
                                                Save failed
                                            </span>
                                        )}
                                    </div>

                                    {/* Provider/Model Badge */}
                                    {media.providerName && (
                                        <div className="absolute top-2 left-2">
                                            <span className="px-2 py-1 text-[10px] font-medium rounded bg-black/70 text-white max-w-32 truncate inline-block">
                                                {media.providerName}
                                            </span>
                                        </div>
                                    )}

                                    {/* Overlay Actions */}
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-end">
                                            <div className="w-full p-3 space-y-2">
                                                {/* Prompt Preview */}
                                                <p className="text-xs text-white line-clamp-2">{media.prompt}</p>

                                                {/* Actions */}
                                                <div className="flex flex-wrap gap-2 items-center">
                                                    <Button
                                                        size="xs"
                                                        variant="solid"
                                                        icon={<HiOutlineDownload />}
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            handleDownload(media)
                                                        }}
                                                    />
                                                    {/* Edit/Animate live inside the preview modal — clicking
                                                        the card opens it, so a card-level Edit was redundant. */}
                                                    {onPost && (
                                                        <Button
                                                            size="xs"
                                                            variant="solid"
                                                            color="green"
                                                            icon={<HiOutlineShare />}
                                                            disabled={media.saveState !== 'saved'}
                                                            title={
                                                                media.saveState === 'saving'
                                                                    ? 'Saving to gallery…'
                                                                    : media.saveState !== 'saved'
                                                                      ? 'Save to gallery first'
                                                                      : undefined
                                                            }
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                onPost(media)
                                                            }}
                                                        >
                                                            <span>Post</span>
                                                        </Button>
                                                    )}
                                                    {/* Save + Delete grouped on the right, both solid so
                                                        they stay visible over the image. */}
                                                    <div className="ml-auto flex gap-1.5">
                                                        {onSaveToGallery && (
                                                            <Button
                                                                size="xs"
                                                                variant="solid"
                                                                icon={<HiOutlineSave />}
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    onSaveToGallery(media)
                                                                }}
                                                            >
                                                                <span>Save</span>
                                                            </Button>
                                                        )}
                                                        <Button
                                                            size="xs"
                                                            variant="solid"
                                                            color="red"
                                                            icon={<HiOutlineTrash />}
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                setDeleteTarget(media)
                                                            }}
                                                        >
                                                            <span>Delete</span>
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                </Card>
                            )
                        })}
                    </div>
                </div>
            </ScrollBar>

            <ConfirmDialog
                isOpen={!!deleteTarget}
                type="danger"
                title="Delete this generation?"
                onClose={() => setDeleteTarget(null)}
                onRequestClose={() => setDeleteTarget(null)}
                onCancel={() => setDeleteTarget(null)}
                onConfirm={handleDeleteConfirmed}
                confirmButtonProps={{ loading: isDeleting }}
            >
                <p>
                    It will be removed from your gallery
                    {deleteTarget?.generationId ? ' and deleted from the database' : ''}.
                </p>
            </ConfirmDialog>
        </div>
    )
}

export default GalleryPanel
