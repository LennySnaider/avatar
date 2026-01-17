'use client'

import { useEffect } from 'react'
import { useIssueStore } from '../_store/issueStore'
import type { IssueDetail, ProjectMembers } from '../types'
import type { CommonProps } from '@/@types/common'

interface IssueProviderProps extends CommonProps {
    issueData: IssueDetail
    memberList: ProjectMembers
}

const IssueProvider = ({
    issueData,
    memberList,
    children,
}: IssueProviderProps) => {
    const updateIssueData = useIssueStore((state) => state.updateIssueData)

    const setInitialLoading = useIssueStore((state) => state.setInitialLoading)
    const setMembers = useIssueStore((state) => state.setMembers)

    useEffect(() => {
        updateIssueData(issueData)
        setMembers(memberList.participantMembers)

        setInitialLoading(false)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [issueData])

    return <>{children}</>
}

export default IssueProvider
