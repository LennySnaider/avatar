'use client'

import { useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAvatarListStore } from '../_store/avatarListStore'
import AvatarCard from './AvatarCard'
import Spinner from '@/components/ui/Spinner'
import Pagination from '@/components/ui/Pagination'

interface AvatarGridProps {
    total: number
    pageIndex: number
    pageSize: number
}

const AvatarGrid = ({ total, pageIndex, pageSize }: AvatarGridProps) => {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { avatarList, initialLoading, searchQuery } = useAvatarListStore()

    const filteredAvatars = useMemo(() => {
        if (!searchQuery) return avatarList

        const query = searchQuery.toLowerCase()
        return avatarList.filter(
            (avatar) =>
                avatar.name.toLowerCase().includes(query) ||
                avatar.face_description?.toLowerCase().includes(query)
        )
    }, [avatarList, searchQuery])

    if (initialLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Spinner size={40} />
            </div>
        )
    }

    if (filteredAvatars.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                <p className="text-lg">No avatars found</p>
                <p className="text-sm mt-2">
                    {searchQuery
                        ? 'Try a different search term'
                        : 'Create your first avatar in the Avatar Studio'}
                </p>
            </div>
        )
    }

    const totalPages = Math.ceil(total / pageSize)

    const handlePageChange = (page: number) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('pageIndex', page.toString())
        router.push(`?${params.toString()}`)
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {filteredAvatars.map((avatar) => (
                    <AvatarCard key={avatar.id} avatar={avatar} />
                ))}
            </div>

            {totalPages > 1 && (
                <div className="flex justify-center">
                    <Pagination
                        currentPage={pageIndex}
                        total={total}
                        pageSize={pageSize}
                        onChange={handlePageChange}
                    />
                </div>
            )}
        </div>
    )
}

export default AvatarGrid
