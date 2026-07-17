'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { useAvatarListStore } from '../_store/avatarListStore'
import { apiDeleteAvatar } from '@/services/AvatarForgeService'
import { HiOutlinePlus, HiOutlineTrash, HiOutlineSearch } from 'react-icons/hi'

const AvatarListActionTools = () => {
    const router = useRouter()
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)

    const { selectedAvatars, searchQuery, setSearchQuery, clearSelection, deleteAvatar } =
        useAvatarListStore()

    const handleCreateNew = () => {
        router.push('/concepts/avatar-forge/avatar-creator')
    }

    const handleDeleteSelected = async () => {
        setIsDeleting(true)
        try {
            await Promise.all(
                selectedAvatars.map((avatar) => apiDeleteAvatar(avatar.id))
            )
            selectedAvatars.forEach((avatar) => deleteAvatar(avatar.id))
            clearSelection()
            setDeleteConfirmOpen(false)
        } catch (error) {
            console.error('Failed to delete avatars:', error)
        } finally {
            setIsDeleting(false)
        }
    }

    return (
        <>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center gap-2">
                    <h3 className="text-xl font-semibold">My Avatars</h3>
                    {selectedAvatars.length > 0 && (
                        <span className="text-sm text-gray-500">
                            ({selectedAvatars.length} selected)
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    <Input
                        size="sm"
                        placeholder="Search avatars..."
                        prefix={<HiOutlineSearch className="text-lg" />}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="min-w-[200px]"
                    />

                    {selectedAvatars.length > 0 && (
                        <Button
                            size="sm"
                            variant="plain"
                            color="red"
                            icon={<HiOutlineTrash />}
                            onClick={() => setDeleteConfirmOpen(true)}
                        >
                            Delete ({selectedAvatars.length})
                        </Button>
                    )}

                    <Button
                        size="sm"
                        variant="solid"
                        icon={<HiOutlinePlus />}
                        onClick={handleCreateNew}
                    >
                        New Avatar
                    </Button>
                </div>
            </div>

            <ConfirmDialog
                isOpen={deleteConfirmOpen}
                type="danger"
                title="Delete Avatars"
                onClose={() => setDeleteConfirmOpen(false)}
                onRequestClose={() => setDeleteConfirmOpen(false)}
                onCancel={() => setDeleteConfirmOpen(false)}
                onConfirm={handleDeleteSelected}
                confirmButtonProps={{ loading: isDeleting }}
            >
                <p>
                    Are you sure you want to delete {selectedAvatars.length}{' '}
                    avatar(s)? This action cannot be undone.
                </p>
            </ConfirmDialog>
        </>
    )
}

export default AvatarListActionTools
