'use client'

import { useEffect } from 'react'
import { useTasksStore } from '../_store/tasksStore'
import type { Groups, ProjectMembers } from '../types'
import type { CommonProps } from '@/@types/common'

interface ProjectListProviderProps extends CommonProps {
    data: Groups
    projectMembers: ProjectMembers
}
const ProjectListProvider = ({
    children,
    data,
    projectMembers,
}: ProjectListProviderProps) => {
    const updateOrdered = useTasksStore((state) => state.updateOrdered)
    const updateGroups = useTasksStore((state) => state.updateGroups)
    const updateBoardMembers = useTasksStore(
        (state) => state.updateBoardMembers,
    )
    const updateAllMembers = useTasksStore((state) => state.updateAllMembers)

    useEffect(() => {
        updateOrdered(Object.keys(data))
        updateGroups(data)
        updateBoardMembers(projectMembers.participantMembers)
        updateAllMembers(projectMembers.allMembers)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, projectMembers])

    return <>{children}</>
}

export default ProjectListProvider
