'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { usePromptLibraryStore } from '../_store/promptLibraryStore'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Card from '@/components/ui/Card'
import Dialog from '@/components/ui/Dialog'
import Spinner from '@/components/ui/Spinner'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { apiCreatePrompt, apiDeletePrompt } from '@/services/AvatarForgeService'
import {
    HiOutlinePlus,
    HiOutlineSearch,
    HiOutlineTrash,
    HiOutlinePhotograph,
    HiOutlineVideoCamera,
    HiOutlineClipboardCopy,
} from 'react-icons/hi'
import type { MediaType, Prompt } from '../types'

interface PromptListProps {
    userId?: string
}

const PromptList = ({ userId }: PromptListProps) => {
    const router = useRouter()
    const [showAddDialog, setShowAddDialog] = useState(false)
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null)
    const [newPromptName, setNewPromptName] = useState('')
    const [newPromptText, setNewPromptText] = useState('')
    const [newPromptType, setNewPromptType] = useState<MediaType>('IMAGE')
    const [isSaving, setIsSaving] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)

    const {
        filteredPrompts,
        searchQuery,
        mediaTypeFilter,
        isLoading,
        setSearchQuery,
        setMediaTypeFilter,
        addPrompt,
        deletePrompt,
    } = usePromptLibraryStore()

    const handleAddPrompt = async () => {
        if (!userId || !newPromptName.trim() || !newPromptText.trim()) return

        setIsSaving(true)
        try {
            const prompt = await apiCreatePrompt({
                user_id: userId,
                name: newPromptName.trim(),
                text: newPromptText.trim(),
                media_type: newPromptType,
            })
            addPrompt(prompt)
            setShowAddDialog(false)
            setNewPromptName('')
            setNewPromptText('')
            toast.push(
                <Notification type="success" title="Success">
                    Prompt saved successfully
                </Notification>
            )
        } catch (error) {
            console.error('Failed to save prompt:', error)
            toast.push(
                <Notification type="danger" title="Error">
                    Failed to save prompt
                </Notification>
            )
        } finally {
            setIsSaving(false)
        }
    }

    const handleDeletePrompt = async () => {
        if (!selectedPromptId) return

        setIsDeleting(true)
        try {
            await apiDeletePrompt(selectedPromptId)
            deletePrompt(selectedPromptId)
            setShowDeleteDialog(false)
            setSelectedPromptId(null)
            toast.push(
                <Notification type="success" title="Deleted">
                    Prompt deleted successfully
                </Notification>
            )
        } catch (error) {
            console.error('Failed to delete prompt:', error)
            toast.push(
                <Notification type="danger" title="Error">
                    Failed to delete prompt
                </Notification>
            )
        } finally {
            setIsDeleting(false)
        }
    }

    const handleCopyPrompt = (text: string) => {
        navigator.clipboard.writeText(text)
        toast.push(
            <Notification type="success" title="Copied">
                Prompt copied to clipboard
            </Notification>
        )
    }

    const handleUsePrompt = (prompt: Prompt) => {
        // Navigate to studio with prompt
        router.push(
            `/concepts/avatar-forge/avatar-studio?prompt=${encodeURIComponent(prompt.text)}&mode=${prompt.media_type}`
        )
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Spinner size={40} />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <h3 className="text-xl font-semibold">Prompt Library</h3>

                <div className="flex items-center gap-3">
                    <Input
                        size="sm"
                        placeholder="Search prompts..."
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
                        <option value="IMAGE">Image</option>
                        <option value="VIDEO">Video</option>
                    </select>

                    <Button
                        size="sm"
                        variant="solid"
                        icon={<HiOutlinePlus />}
                        onClick={() => setShowAddDialog(true)}
                    >
                        New Prompt
                    </Button>
                </div>
            </div>

            {/* Prompt Grid */}
            {filteredPrompts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                    <p className="text-lg">No prompts found</p>
                    <p className="text-sm mt-2">
                        {searchQuery
                            ? 'Try a different search term'
                            : 'Save your favorite prompts for quick access'}
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredPrompts.map((prompt) => (
                        <Card
                            key={prompt.id}
                            className="p-4 hover:shadow-lg transition-shadow cursor-pointer"
                            onClick={() => handleUsePrompt(prompt)}
                        >
                            <div className="flex items-start justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    {prompt.media_type === 'VIDEO' ? (
                                        <HiOutlineVideoCamera className="w-4 h-4 text-purple-500" />
                                    ) : (
                                        <HiOutlinePhotograph className="w-4 h-4 text-blue-500" />
                                    )}
                                    <h4 className="font-medium">{prompt.name}</h4>
                                </div>
                                <span
                                    className={`px-2 py-0.5 text-xs font-medium rounded ${
                                        prompt.media_type === 'VIDEO'
                                            ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                                            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                    }`}
                                >
                                    {prompt.media_type}
                                </span>
                            </div>

                            <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-3 mb-4">
                                {prompt.text}
                            </p>

                            <div className="flex items-center gap-2">
                                <Button
                                    size="xs"
                                    variant="plain"
                                    icon={<HiOutlineClipboardCopy />}
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        handleCopyPrompt(prompt.text)
                                    }}
                                >
                                    Copy
                                </Button>
                                <Button
                                    size="xs"
                                    variant="plain"
                                    color="red"
                                    icon={<HiOutlineTrash />}
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        setSelectedPromptId(prompt.id)
                                        setShowDeleteDialog(true)
                                    }}
                                >
                                    Delete
                                </Button>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {/* Add Prompt Dialog */}
            <Dialog
                isOpen={showAddDialog}
                onClose={() => setShowAddDialog(false)}
            >
                <h4 className="text-lg font-semibold mb-4">Save New Prompt</h4>
                <div className="space-y-4">
                    <div>
                        <label className="text-sm font-medium mb-1 block">Name</label>
                        <Input
                            value={newPromptName}
                            onChange={(e) => setNewPromptName(e.target.value)}
                            placeholder="My awesome prompt"
                        />
                    </div>

                    <div>
                        <label className="text-sm font-medium mb-1 block">Prompt Text</label>
                        <textarea
                            value={newPromptText}
                            onChange={(e) => setNewPromptText(e.target.value)}
                            placeholder="Enter your prompt text..."
                            rows={4}
                            className="w-full p-3 border rounded-lg bg-transparent resize-none"
                        />
                    </div>

                    <div>
                        <label className="text-sm font-medium mb-1 block">Type</label>
                        <select
                            value={newPromptType}
                            onChange={(e) => setNewPromptType(e.target.value as MediaType)}
                            className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
                        >
                            <option value="IMAGE">Image</option>
                            <option value="VIDEO">Video</option>
                        </select>
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                        <Button variant="plain" onClick={() => setShowAddDialog(false)}>
                            Cancel
                        </Button>
                        <Button
                            variant="solid"
                            onClick={handleAddPrompt}
                            loading={isSaving}
                            disabled={!newPromptName.trim() || !newPromptText.trim()}
                        >
                            Save Prompt
                        </Button>
                    </div>
                </div>
            </Dialog>

            {/* Delete Confirmation */}
            <ConfirmDialog
                isOpen={showDeleteDialog}
                type="danger"
                title="Delete Prompt"
                onClose={() => setShowDeleteDialog(false)}
                onRequestClose={() => setShowDeleteDialog(false)}
                onCancel={() => setShowDeleteDialog(false)}
                onConfirm={handleDeletePrompt}
                confirmButtonProps={{ loading: isDeleting }}
            >
                <p>Are you sure you want to delete this prompt? This action cannot be undone.</p>
            </ConfirmDialog>
        </div>
    )
}

export default PromptList
