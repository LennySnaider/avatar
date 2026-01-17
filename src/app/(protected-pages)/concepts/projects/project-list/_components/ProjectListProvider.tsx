'use client'

import { useEffect } from 'react'
import { useProjectListStore } from '../_store/projectListStore'
import type { ProjectList, ProjectMembers } from '../types'
import type { CommonProps } from '@/@types/common'

interface ProjectListProviderProps extends CommonProps {
    projectList: ProjectList
    projectMembers: ProjectMembers
}
const ProjectListProvider = ({
    children,
    projectList,
    projectMembers,
}: ProjectListProviderProps) => {
    const setProjectList = useProjectListStore((state) => state.setProjectList)
    const setMembers = useProjectListStore((state) => state.setMembers)

    useEffect(() => {
        setProjectList(projectList)
        setMembers(
            projectMembers.allMembers.map((item) => ({
                value: item.id,
                label: item.name,
                img: item.img,
            })),
        )
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return <>{children}</>
}

export default ProjectListProvider
