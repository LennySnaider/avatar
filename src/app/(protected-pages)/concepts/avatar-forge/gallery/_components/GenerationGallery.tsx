'use client'

import { useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Dialog from '@/components/ui/Dialog'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { apiDeleteGeneration } from '@/services/AvatarForgeService'
import {
    HiOutlineSearch,
    HiOutlineDownload,
    HiOutlineTrash,
    HiOutlinePhotograph,
    HiOutlineVideoCamera,
    HiOutlinePlay,
    HiOutlineX,
    HiOutlinePencil,
    HiOutlineFilm,
} from 'react-icons/hi'
import { useRouter } from 'next/navigation'
import type { Generation, MediaType } from '@/@types/supabase'

interface GenerationWithUrl extends Generation {
    signedUrl?: string
}

interface GenerationGalleryProps {
    generations: GenerationWithUrl[]
}

const GenerationGallery = ({ generations: initialGenerations }: GenerationGalleryProps) => {
    const router = useRouter()
    const [generations, setGenerations] = useState(initialGenerations)
    const [searchQuery, setSearchQuery] = useState('')
    const [mediaTypeFilter, setMediaTypeFilter] = useState<MediaType | 'ALL'>('ALL')
    const [selectedGeneration, setSelectedGeneration] = useState<GenerationWithUrl | null>(null)
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    // Filter generations
    const filteredGenerations = generations.filter((gen) => {
        const matchesSearch =
            !searchQuery || gen.prompt.toLowerCase().includes(searchQuery.toLowerCase())
        const matchesType = mediaTypeFilter === 'ALL' || gen.media_type === mediaTypeFilter
        return matchesSearch && matchesType
    })

    const handleDownload = async (gen: GenerationWithUrl) => {
        if (!gen.signedUrl) return

        const link = document.createElement('a')
        link.href = gen.signedUrl
        link.download = `generation-${gen.id}.${gen.media_type === 'VIDEO' ? 'mp4' : 'jpg'}`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    const handleDelete = async () => {
        if (!deletingId) return

        setIsDeleting(true)
        try {
            await apiDeleteGeneration(deletingId)
            setGenerations((prev) => prev.filter((g) => g.id !== deletingId))
            setShowDeleteDialog(false)
            setDeletingId(null)
            if (selectedGeneration?.id === deletingId) {
                setSelectedGeneration(null)
            }
            toast.push(
                <Notification type="success" title="Deleted">
                    Generation deleted successfully
                </Notification>
            )
        } catch (error) {
            console.error('Failed to delete:', error)
            toast.push(
                <Notification type="danger" title="Error">
                    Failed to delete generation
                </Notification>
            )
        } finally {
            setIsDeleting(false)
        }
    }

    const handleOpenInStudio = (gen: GenerationWithUrl, mode: 'edit' | 'animate') => {
        // Store the generation data in sessionStorage for the studio to pick up
        sessionStorage.setItem('studioImport', JSON.stringify({
            url: gen.signedUrl,
            prompt: gen.prompt,
            mediaType: gen.media_type,
            mode,
        }))
        router.push('/concepts/avatar-forge/avatar-studio')
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h3 className="text-xl font-semibold">Generation Gallery</h3>
                    <p className="text-sm text-gray-500">
                        {generations.length} generations saved
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <Input
                        size="sm"
                        placeholder="Search by prompt..."
                        prefix={<HiOutlineSearch className="text-lg" />}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="min-w-[200px]"
                    />

                    <select
                        value={mediaTypeFilter}
                        onChange={(e) => setMediaTypeFilter(e.target.value as MediaType | 'ALL')}
                        className="w-32 px-3 py-1.5 text-sm border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
                    >
                        <option value="ALL">All Types</option>
                        <option value="IMAGE">Images</option>
                        <option value="VIDEO">Videos</option>
                    </select>
                </div>
            </div>

            {/* Empty State */}
            {filteredGenerations.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                    <HiOutlinePhotograph className="w-12 h-12 mb-4" />
                    <p className="text-lg">No generations found</p>
                    <p className="text-sm mt-2">
                        {searchQuery
                            ? 'Try a different search term'
                            : 'Generate some content in the Avatar Studio'}
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {filteredGenerations.map((gen) => (
                        <Card
                            key={gen.id}
                            className="relative group overflow-hidden cursor-pointer"
                            onClick={() => setSelectedGeneration(gen)}
                        >
                            <div className="aspect-square bg-black">
                                {gen.media_type === 'VIDEO' ? (
                                    <div className="relative w-full h-full">
                                        <video
                                            src={gen.signedUrl}
                                            className="w-full h-full object-cover"
                                            muted
                                            loop
                                            onMouseOver={(e) => e.currentTarget.play()}
                                            onMouseOut={(e) => {
                                                e.currentTarget.pause()
                                                e.currentTarget.currentTime = 0
                                            }}
                                        />
                                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                            <div className="w-12 h-12 bg-black/50 rounded-full flex items-center justify-center group-hover:opacity-0 transition-opacity">
                                                <HiOutlinePlay className="w-6 h-6 text-white ml-1" />
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <img
                                        src={gen.signedUrl}
                                        alt={gen.prompt}
                                        className="w-full h-full object-cover"
                                    />
                                )}
                            </div>

                            {/* Media Type Badge */}
                            <div className="absolute top-2 right-2">
                                {gen.media_type === 'VIDEO' ? (
                                    <HiOutlineVideoCamera className="w-5 h-5 text-white drop-shadow" />
                                ) : (
                                    <HiOutlinePhotograph className="w-5 h-5 text-white drop-shadow" />
                                )}
                            </div>

                            {/* Overlay */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                                <div className="absolute bottom-0 left-0 right-0 p-3">
                                    <p className="text-xs text-white line-clamp-2">{gen.prompt}</p>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {/* Preview Dialog */}
            <Dialog
                isOpen={!!selectedGeneration}
                onClose={() => setSelectedGeneration(null)}
                width={800}
                closable={false}
                className="!p-0 !bg-black/95"
            >
                {selectedGeneration && (
                    <div className="relative">
                        {/* Close Button */}
                        <button
                            onClick={() => setSelectedGeneration(null)}
                            className="absolute top-2 right-2 z-10 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
                        >
                            <HiOutlineX className="w-5 h-5" />
                        </button>

                        {/* Media */}
                        <div className="max-h-[60vh] flex items-center justify-center">
                            {selectedGeneration.media_type === 'VIDEO' ? (
                                <video
                                    src={selectedGeneration.signedUrl}
                                    className="max-w-full max-h-[60vh]"
                                    controls
                                    autoPlay
                                />
                            ) : (
                                <img
                                    src={selectedGeneration.signedUrl}
                                    alt={selectedGeneration.prompt}
                                    className="max-w-full max-h-[60vh]"
                                />
                            )}
                        </div>

                        {/* Info */}
                        <div className="p-4 bg-gray-900">
                            <p className="text-sm text-gray-300 mb-3 line-clamp-2">{selectedGeneration.prompt}</p>
                            <div className="flex items-center gap-3">
                                <Button
                                    size="sm"
                                    variant="solid"
                                    icon={<HiOutlineDownload />}
                                    onClick={() => handleDownload(selectedGeneration)}
                                >
                                    <span>Download</span>
                                </Button>
                                {selectedGeneration.media_type === 'IMAGE' && (
                                    <>
                                        <Button
                                            size="sm"
                                            variant="plain"
                                            icon={<HiOutlinePencil />}
                                            onClick={() => handleOpenInStudio(selectedGeneration, 'edit')}
                                        >
                                            <span>Edit</span>
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="plain"
                                            color="purple"
                                            icon={<HiOutlineFilm />}
                                            onClick={() => handleOpenInStudio(selectedGeneration, 'animate')}
                                        >
                                            <span>Animate</span>
                                        </Button>
                                    </>
                                )}
                                <Button
                                    size="sm"
                                    variant="plain"
                                    color="red"
                                    icon={<HiOutlineTrash />}
                                    onClick={() => {
                                        setDeletingId(selectedGeneration.id)
                                        setShowDeleteDialog(true)
                                    }}
                                >
                                    <span>Delete</span>
                                </Button>
                                <div className="flex-1" />
                                <span className="text-xs text-gray-500">
                                    {new Date(selectedGeneration.created_at || '').toLocaleDateString()}
                                </span>
                            </div>
                        </div>
                    </div>
                )}
            </Dialog>

            {/* Delete Confirmation */}
            <ConfirmDialog
                isOpen={showDeleteDialog}
                type="danger"
                title="Delete Generation"
                onClose={() => setShowDeleteDialog(false)}
                onRequestClose={() => setShowDeleteDialog(false)}
                onCancel={() => setShowDeleteDialog(false)}
                onConfirm={handleDelete}
                confirmButtonProps={{ loading: isDeleting }}
            >
                <p>Are you sure you want to delete this generation? This action cannot be undone.</p>
            </ConfirmDialog>
        </div>
    )
}

export default GenerationGallery
