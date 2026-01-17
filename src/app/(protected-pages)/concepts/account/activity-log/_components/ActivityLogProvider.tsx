'use client'
import { useEffect } from 'react'
import { useActivityLog } from '../_store/activityLogStore'
import type { Activities } from '../types'
import type { CommonProps } from '@/@types/common'

interface ActivityLogProviderProps extends CommonProps {
    data: Activities
    loadable: boolean
}

const ActivityLogProvider = ({
    data,
    loadable,
    children,
}: ActivityLogProviderProps) => {
    const setData = useActivityLog((state) => state.setData)
    const setLoadable = useActivityLog((state) => state.setLoadable)
    const setInitialLoading = useActivityLog((state) => state.setInitialLoading)

    useEffect(() => {
        setData(data)
        setLoadable(loadable)
        setInitialLoading(false)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, loadable])

    return <>{children}</>
}

export default ActivityLogProvider
