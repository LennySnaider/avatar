'use client'

import { useState, lazy, Suspense } from 'react'
import Spinner from '@/components/ui/Spinner'
import ProjectDetailsHeader from './ProjectDetailsHeader'
import ProjectDetailsNavigation from './ProjectDetailsNavigation'
import useResponsive from '@/utils/hooks/useResponsive'
import { apiGetProject } from '@/services/ProjectService'
import useSWR from 'swr'
import type { GetProjectDetailsResponse } from '../types'

const defaultNavValue = 'overview'
const settingsNavValue = 'settings'

const ProjectDetailsOverview = lazy(() => import('./ProjectDetailsOverview'))
const ProjectDetailsTask = lazy(() => import('./ProjectDetailsTask'))
const ProjectDetailsAttachments = lazy(
    () => import('./ProjectDetailsAttachments'),
)
const ProjectDetailsActivity = lazy(() => import('./ProjectDetailsActivity'))
const ProjectDetailsSetting = lazy(() => import('./ProjectDetailsSetting'))

const ProjectDetails = ({ id }: { id: string }) => {
    const { data, mutate } = useSWR<GetProjectDetailsResponse, { id: string }>(
        [`/api/projects/${id}`],
        () => apiGetProject({ id }),
        {
            revalidateOnFocus: false,
            revalidateIfStale: false,
            revalidateOnReconnect: false,
        },
    )

    const { larger } = useResponsive()

    const [selectedNav, setSelectedNav] = useState(defaultNavValue)
    const [isContentEdit, setIsContentEdit] = useState(false)

    const handleEdit = (isEdit: boolean) => {
        setSelectedNav(settingsNavValue)
        setIsContentEdit(isEdit)
    }

    const handleContentChange = (content: string) => {
        mutate({ ...(data as GetProjectDetailsResponse), content }, false)
        setIsContentEdit(false)
    }

    const handleUpdate = ({
        name,
        content,
        dueDate,
    }: {
        name: string
        content: string
        dueDate: number
    }) => {
        const newData = { ...data }
        newData.name = name
        newData.content = content
        if (newData.schedule) {
            newData.schedule.dueDate = dueDate
        }

        mutate({ ...(newData as GetProjectDetailsResponse) }, false)
        setIsContentEdit(false)
        setSelectedNav(defaultNavValue)
    }

    const handleNavigationChange = (val: string) => {
        if (val === settingsNavValue) {
            setIsContentEdit(true)
        } else {
            setIsContentEdit(false)
        }
        setSelectedNav(val)
    }

    return (
        <div>
            {data && (
                <>
                    <ProjectDetailsHeader
                        title={data.name}
                        isContentEdit={isContentEdit}
                        selected={selectedNav}
                        onEdit={handleEdit}
                        onChange={handleNavigationChange}
                    />
                    <div className="mt-6 flex gap-12">
                        {larger.xl && (
                            <ProjectDetailsNavigation
                                selected={selectedNav}
                                onChange={handleNavigationChange}
                            />
                        )}
                        <div className="w-full">
                            <Suspense
                                fallback={
                                    <div className="my-4 mx-auto text-center flex justify-center">
                                        <Spinner size={40} />
                                    </div>
                                }
                            >
                                {selectedNav === defaultNavValue && (
                                    <ProjectDetailsOverview
                                        content={data.content}
                                        client={data.client}
                                        schedule={data.schedule}
                                        isContentEdit={isContentEdit}
                                        setIsContentEdit={setIsContentEdit}
                                        onContentChange={handleContentChange}
                                    />
                                )}
                                {selectedNav === 'tasks' && (
                                    <ProjectDetailsTask />
                                )}
                                {selectedNav === 'attachments' && (
                                    <ProjectDetailsAttachments />
                                )}
                                {selectedNav === 'activity' && (
                                    <ProjectDetailsActivity />
                                )}
                                {selectedNav === 'settings' && (
                                    <ProjectDetailsSetting
                                        name={data.name}
                                        content={data.content}
                                        dueDate={data.schedule.dueDate}
                                        onUpdate={handleUpdate}
                                    />
                                )}
                            </Suspense>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}

export default ProjectDetails
