'use client'
import { useState } from 'react'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Loading from '@/components/shared/Loading'
import Log from './Log'
import LogAction from './LogAction'
import { apiGetLogs } from '@/services/LogService'
import {
    UPDATE_TICKET,
    COMMENT,
    COMMENT_MENTION,
    ASSIGN_TICKET,
    ADD_TAGS_TO_TICKET,
    ADD_FILES_TO_TICKET,
    CREATE_TICKET,
} from '@/components/view/Activity/constants'
import { useActivityLog } from '../_store/activityLogStore'
import type { GetActivityLogResponse } from '../types'

const defaultSelectedType = [
    UPDATE_TICKET,
    COMMENT,
    COMMENT_MENTION,
    ASSIGN_TICKET,
    ADD_TAGS_TO_TICKET,
    ADD_FILES_TO_TICKET,
    CREATE_TICKET,
]

const ActivityLog = () => {
    const [isLoading, setIsLoading] = useState(false)
    const [activityIndex, setActivityIndex] = useState(1)
    const [showMentionedOnly, setShowMentionedOnly] = useState(false)
    const [selectedType, setSelectedType] =
        useState<string[]>(defaultSelectedType)

    const activities = useActivityLog((state) => state.data)
    const setActivities = useActivityLog((state) => state.setData)
    const loadable = useActivityLog((state) => state.loadable)
    const setLoadable = useActivityLog((state) => state.setLoadable)
    const initialLoading = useActivityLog((state) => state.initialLoading)

    const getLogs = async (index: number) => {
        setIsLoading(true)
        const resp = await apiGetLogs<
            GetActivityLogResponse,
            { activityIndex: number }
        >({ activityIndex: index })
        setActivities([...activities, ...resp.data])
        setLoadable(resp.loadable)
        setIsLoading(false)
    }

    const handleFilterChange = (selected: string) => {
        setShowMentionedOnly(false)
        if (selectedType.includes(selected)) {
            setSelectedType((prevData) =>
                prevData.filter((prev) => prev !== selected),
            )
        } else {
            setSelectedType((prevData) => [...prevData, ...[selected]])
        }
    }

    const handleLoadMore = () => {
        setActivityIndex((prevIndex) => prevIndex + 1)
        getLogs(activityIndex + 1)
    }

    const handleCheckboxChange = (bool: boolean) => {
        setShowMentionedOnly(bool)
        if (bool) {
            setSelectedType([COMMENT_MENTION])
        } else {
            setSelectedType(defaultSelectedType)
        }
    }

    return (
        <AdaptiveCard className="h-full" bodyClass="h-full">
            <div className="max-w-[800px] mx-auto h-full">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <h3>Acitvity log</h3>
                    <LogAction
                        selectedType={selectedType}
                        showMentionedOnly={showMentionedOnly}
                        onFilterChange={handleFilterChange}
                        onCheckboxChange={handleCheckboxChange}
                    />
                </div>
                {initialLoading ? (
                    <div className="flex flex-col justify-center h-full">
                        <Loading loading={true} />
                    </div>
                ) : (
                    <Log
                        isLoading={isLoading}
                        loadable={loadable}
                        activities={activities}
                        filter={selectedType}
                        onLoadMore={handleLoadMore}
                    />
                )}
            </div>
        </AdaptiveCard>
    )
}

export default ActivityLog
