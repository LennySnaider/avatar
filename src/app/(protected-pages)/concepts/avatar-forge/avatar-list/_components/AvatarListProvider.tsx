'use client'

import { useEffect } from 'react'
import { useAvatarListStore } from '../_store/avatarListStore'
import type { AvatarWithReferences } from '../types'
import type { CommonProps } from '@/@types/common'

interface AvatarListProviderProps extends CommonProps {
    avatarList: AvatarWithReferences[]
}

const AvatarListProvider = ({
    avatarList,
    children,
}: AvatarListProviderProps) => {
    const setAvatarList = useAvatarListStore((state) => state.setAvatarList)
    const setInitialLoading = useAvatarListStore(
        (state) => state.setInitialLoading
    )

    useEffect(() => {
        setAvatarList(avatarList)
        setInitialLoading(false)
    }, [avatarList, setAvatarList, setInitialLoading])

    return <>{children}</>
}

export default AvatarListProvider
