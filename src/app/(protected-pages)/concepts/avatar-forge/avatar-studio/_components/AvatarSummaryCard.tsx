'use client'

import { useAvatarStudioStore } from '../_store/avatarStudioStore'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import { HiOutlineUser, HiOutlinePencil, HiOutlineSwitchHorizontal } from 'react-icons/hi'

interface AvatarSummaryCardProps {
    onChangeAvatar: () => void
    onEditAvatar: () => void
}

const AvatarSummaryCard = ({ onChangeAvatar, onEditAvatar }: AvatarSummaryCardProps) => {
    const {
        avatarId,
        avatarName,
        generalReferences,
        faceRef,
        angleRef,
        bodyRef,
        identityWeight,
        faceDescription,
    } = useAvatarStudioStore()

    // Calculate refs count
    const refsCount = generalReferences.length +
        (faceRef ? 1 : 0) +
        (angleRef ? 1 : 0) +
        (bodyRef ? 1 : 0)

    // Get thumbnail to display (prefer face > angle > body > first general)
    const thumbnail = faceRef?.thumbnailUrl || faceRef?.url ||
        angleRef?.thumbnailUrl || angleRef?.url ||
        bodyRef?.thumbnailUrl || bodyRef?.url ||
        generalReferences[0]?.thumbnailUrl || generalReferences[0]?.url

    const hasAvatar = avatarId || refsCount > 0

    if (!hasAvatar) {
        return (
            <Card className="p-4">
                <div className="flex flex-col items-center text-center py-4">
                    <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
                        <HiOutlineUser className="w-8 h-8 text-gray-400" />
                    </div>
                    <p className="text-sm text-gray-500 mb-3">No avatar selected</p>
                    <Button
                        size="sm"
                        variant="solid"
                        icon={<HiOutlineUser />}
                        onClick={onChangeAvatar}
                    >
                        Select Avatar
                    </Button>
                </div>
            </Card>
        )
    }

    return (
        <Card className="overflow-hidden">
            {/* Avatar Thumbnail */}
            <div className="relative aspect-square bg-gray-100 dark:bg-gray-800">
                {thumbnail ? (
                    <img
                        src={thumbnail}
                        alt={avatarName || 'Avatar'}
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <HiOutlineUser className="w-16 h-16 text-gray-400" />
                    </div>
                )}
            </div>

            {/* Avatar Info */}
            <div className="p-3">
                <h4 className="font-semibold text-sm truncate mb-1">
                    {avatarName || 'Unnamed Avatar'}
                </h4>

                {/* Quick Stats */}
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                    <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">
                        {refsCount} refs
                    </span>
                    <span className="px-1.5 py-0.5 bg-primary/10 text-primary rounded">
                        {identityWeight}% identity
                    </span>
                </div>

                {/* Face Description Preview */}
                {faceDescription && (
                    <p className="text-xs text-gray-400 line-clamp-2 mb-3">
                        {faceDescription}
                    </p>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2">
                    <Button
                        size="xs"
                        variant="plain"
                        icon={<HiOutlineSwitchHorizontal />}
                        onClick={onChangeAvatar}
                        className="flex-1"
                    >
                        Change
                    </Button>
                    <Button
                        size="xs"
                        variant="solid"
                        icon={<HiOutlinePencil />}
                        onClick={onEditAvatar}
                        className="flex-1"
                    >
                        Edit
                    </Button>
                </div>
            </div>
        </Card>
    )
}

export default AvatarSummaryCard
