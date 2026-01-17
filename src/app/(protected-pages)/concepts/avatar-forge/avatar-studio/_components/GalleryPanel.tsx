'use client'

import { useAvatarStudioStore } from '../_store/avatarStudioStore'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Spinner from '@/components/ui/Spinner'
import ScrollBar from '@/components/ui/ScrollBar'
import { HiOutlineTrash, HiOutlineDownload, HiOutlineFilm, HiOutlinePhotograph, HiOutlinePencilAlt } from 'react-icons/hi'
import type { GeneratedMedia } from '../types'

interface GalleryPanelProps {
    onAnimateImage?: (media: GeneratedMedia) => void
    onCreateVariant?: (media: GeneratedMedia) => void
    onSaveToGallery?: (media: GeneratedMedia) => Promise<void>
}

const GalleryPanel = ({ onAnimateImage, onSaveToGallery }: GalleryPanelProps) => {
    const {
        gallery,
        isGenerating,
        isMontageMode,
        montageSelection,
        isStitching,
        setPreviewMedia,
        removeFromGallery,
        toggleMontageSelection,
        setIsMontageMode,
        clearMontageSelection,
        openEditor,
    } = useAvatarStudioStore()

    const handleDownload = async (media: GeneratedMedia) => {
        try {
            // For external URLs (like Kling), fetch and download as blob
            const response = await fetch(media.url)
            const blob = await response.blob()
            const blobUrl = window.URL.createObjectURL(blob)

            const link = document.createElement('a')
            link.href = blobUrl
            link.download = `avatar-${media.mediaType.toLowerCase()}-${Date.now()}.${media.mediaType === 'VIDEO' ? 'mp4' : 'jpg'}`
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)

            // Clean up blob URL
            window.URL.revokeObjectURL(blobUrl)
        } catch (error) {
            console.error('Download failed:', error)
            // Fallback: open in new tab
            window.open(media.url, '_blank')
        }
    }

    const handleToggleMontage = () => {
        setIsMontageMode(!isMontageMode)
        if (isMontageMode) {
            clearMontageSelection()
        }
    }

    const hasVideos = gallery.some((m) => m.mediaType === 'VIDEO')

    return (
        <div className="h-full flex flex-col">
            <ScrollBar className="flex-1 h-full" autoHide={false}>
                <div className="p-4">
                    {/* Gallery Header */}
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-lg">Gallery</h3>
                        <div className="flex items-center gap-2">
                            {hasVideos && (
                                <Button
                                    size="xs"
                                    variant={isMontageMode ? 'solid' : 'plain'}
                                    color={isMontageMode ? 'green' : 'gray'}
                                    onClick={handleToggleMontage}
                                    icon={<HiOutlineFilm />}
                                >
                                    <span>{isMontageMode ? 'Exit Studio' : 'Video Studio'}</span>
                                </Button>
                            )}
                            {isMontageMode && montageSelection.length >= 2 && (
                                <Button
                                    size="xs"
                                    variant="solid"
                                    loading={isStitching}
                                >
                                    Stitch ({montageSelection.length})
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Empty State */}
                    {gallery.length === 0 && !isGenerating && (
                        <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                            <div className="w-16 h-16 rounded-full border-2 border-gray-300 flex items-center justify-center mb-4">
                                <HiOutlinePhotograph className="w-8 h-8" />
                            </div>
                            <p className="text-lg font-medium">Ready to Generate</p>
                            <p className="text-sm">Describe a scene and click Generate</p>
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
                        {gallery.map((media) => {
                            const isSelected = montageSelection.includes(media.id)
                            const selectionIndex = montageSelection.indexOf(media.id)

                            return (
                                <Card
                                    key={media.id}
                                    className={`relative group overflow-hidden cursor-pointer transition-all ${
                                        isMontageMode
                                            ? isSelected
                                                ? 'ring-2 ring-green-500'
                                                : media.mediaType !== 'VIDEO'
                                                ? 'opacity-50 grayscale'
                                                : ''
                                            : 'hover:shadow-lg'
                                    }`}
                                    onClick={() => {
                                        if (isMontageMode) {
                                            if (media.mediaType === 'VIDEO') {
                                                toggleMontageSelection(media.id)
                                            }
                                        } else {
                                            setPreviewMedia(media)
                                        }
                                    }}
                                >
                                    {/* Media Content */}
                                    <div className="bg-gray-100 dark:bg-gray-800">
                                        {media.mediaType === 'VIDEO' ? (
                                            <video
                                                src={media.url}
                                                className="w-full h-auto"
                                                muted
                                                loop
                                                onMouseOver={(e) => !isMontageMode && e.currentTarget.play()}
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

                                    {/* Selection Badge (Montage Mode) */}
                                    {isMontageMode && isSelected && (
                                        <div className="absolute top-2 left-2 w-6 h-6 bg-green-500 text-white rounded-full flex items-center justify-center text-xs font-bold">
                                            {selectionIndex + 1}
                                        </div>
                                    )}

                                    {/* Media Type Badge */}
                                    <div className="absolute top-2 right-2">
                                        <span
                                            className={`px-2 py-1 text-xs font-bold rounded ${
                                                media.mediaType === 'VIDEO'
                                                    ? 'bg-purple-500 text-white'
                                                    : 'bg-blue-500 text-white'
                                            }`}
                                        >
                                            {media.mediaType}
                                        </span>
                                    </div>

                                    {/* Overlay Actions */}
                                    {!isMontageMode && (
                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-end">
                                            <div className="w-full p-3 space-y-2">
                                                {/* Prompt Preview */}
                                                <p className="text-xs text-white line-clamp-2">{media.prompt}</p>

                                                {/* Actions */}
                                                <div className="flex gap-2">
                                                    <Button
                                                        size="xs"
                                                        variant="solid"
                                                        icon={<HiOutlineDownload />}
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            handleDownload(media)
                                                        }}
                                                    />
                                                    {media.mediaType === 'IMAGE' && (
                                                        <Button
                                                            size="xs"
                                                            variant="solid"
                                                            color="blue"
                                                            icon={<HiOutlinePencilAlt />}
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                openEditor(media)
                                                            }}
                                                        >
                                                            <span>Edit</span>
                                                        </Button>
                                                    )}
                                                    {media.mediaType === 'IMAGE' && onAnimateImage && (
                                                        <Button
                                                            size="xs"
                                                            variant="solid"
                                                            color="purple"
                                                            icon={<HiOutlineFilm />}
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                onAnimateImage(media)
                                                            }}
                                                        >
                                                            <span>Animate</span>
                                                        </Button>
                                                    )}
                                                    {onSaveToGallery && (
                                                        <Button
                                                            size="xs"
                                                            variant="plain"
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
                                                        variant="plain"
                                                        color="red"
                                                        icon={<HiOutlineTrash />}
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            removeFromGallery(media.id)
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </Card>
                            )
                        })}
                    </div>
                </div>
            </ScrollBar>
        </div>
    )
}

export default GalleryPanel
